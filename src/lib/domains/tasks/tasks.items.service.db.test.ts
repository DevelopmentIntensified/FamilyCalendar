/**
 * tasks item services against real Postgres: one test per IO Invariant of the
 * list reads, the create defaults, the `PUT` field patch, delete/clear and the
 * `family` port adapter. Every test runs in `rollbackTest`; `testCtx({ db,
 * now })` pins the clock, so no test reads the process time.
 *
 * Expected values come from the legacy code (`src/routes/api/tasks/+server.ts`,
 * `[id]/+server.ts`, `db/actions/tasks/{queries,mutations,assignment}.ts`,
 * `taskCategories.ts`) and the frozen goldens (`tasks.http.db.test.ts`,
 * `tasks.update.http.db.test.ts`), never from running this code.
 *
 * Doc: ./README.md#how-to-test
 */
import { and, asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { events, notifications, tasks } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { TaskCreateBody, TaskUpdateBody } from './tasks.contract';
import {
	addMember,
	seedTask,
	seedTaskCategory,
	seedTaskCompletion,
	seedTaskFamily,
	seedTaskFocusSession,
	seedTaskTags,
	seedUserZone
} from './tasks.fixtures.server';
import {
	clearCompletedTasks,
	createTask,
	deleteTask,
	listFamilyTasks,
	listTaskSections,
	listTasks,
	unassignMemberTasks,
	updateTask,
	type TaskListRow,
	type TaskSectionRow,
	type TaskWithTagsRow
} from './tasks.items.service.server';

const NOW = '2026-03-01T09:00:00.000Z';

/** One Event row; the parent Event is calendar's row, not this module's. */
async function seedEvent(db: Db, values: typeof events.$inferInsert) {
	const [row] = await db.insert(events).values(values).returning();
	return row;
}

/** The caller's Alerts, oldest first (assertions name the row, never a service). */
async function alertsOf(db: Db, userId: string) {
	return db
		.select()
		.from(notifications)
		.where(eq(notifications.userId, userId))
		.orderBy(asc(notifications.createdAt));
}

/** A family with Mia (creator) and Sam (member), the common fixture. */
async function seedHousehold(db: Db) {
	const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Lee' });
	const sam = await seedUser(db, { firstName: 'Sam', lastName: 'Diaz' });
	const home = await seedTaskFamily(db, 'Home');
	await addMember(db, mia.id, home.id, 'creator');
	await addMember(db, sam.id, home.id, 'member');
	return { mia, sam, home };
}

describe('createTask', () => {
	rollbackTest('defaults: caller family, self accepted, public, no tags/date, no Alert', async (db) => {
		const { mia, home } = await seedHousehold(db);
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		const created = await createTask(ctx, actor, TaskCreateBody.parse({ title: 'Buy milk' }));

		expect(created).toMatchObject({
			title: 'Buy milk',
			userId: mia.id,
			familyId: home.id,
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			visibility: 'public',
			priority: 'normal',
			dueDate: null,
			category: null,
			tags: []
		});
		expect(await alertsOf(db, mia.id)).toEqual([]);
	});

	rollbackTest('an explicit null family is personal; an unknown category joins the list in its spelling', async (db) => {
		const { mia } = await seedHousehold(db);
		await seedTaskCategory(db, mia.id, 'Work');
		const ctx = testCtx({ db, now: NOW });

		const created = await createTask(
			ctx,
			actorFromUser(mia, 'session'),
			TaskCreateBody.parse({ title: 'Report', familyId: null, category: 'work', tags: ['B', 'a', 'b'] })
		);

		expect(created.familyId).toBeNull();
		expect(created.category).toBe('Work');
		expect(created.tags).toEqual(['a', 'b']);
	});

	rollbackTest('refuses a foreign family and an assignee outside it', async (db) => {
		const { mia, home } = await seedHousehold(db);
		const stranger = await seedUser(db, { firstName: 'Ada' });
		const other = await seedTaskFamily(db, 'Other');
		await addMember(db, stranger.id, other.id);
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		await expect(
			createTask(ctx, actor, TaskCreateBody.parse({ title: 'x', familyId: other.id }))
		).rejects.toMatchObject({ status: 403, message: 'Not a member of this family' });
		await expect(
			createTask(
				ctx,
				actor,
				TaskCreateBody.parse({ title: 'x', familyId: home.id, assignedTo: stranger.id })
			)
		).rejects.toMatchObject({ status: 400, message: 'Assignee is not a member of this family' });
	});

	rollbackTest('attaches a readable event, and refuses a missing or unreadable one', async (db) => {
		const { mia } = await seedHousehold(db);
		const outsider = await seedUser(db, { firstName: 'Eve' });
		const mine = await seedEvent(db, { ownerId: mia.id, title: 'Dentist', start: NOW });
		const theirs = await seedEvent(db, { ownerId: outsider.id, title: 'Private', start: NOW });
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		const created = await createTask(
			ctx,
			actor,
			TaskCreateBody.parse({ title: 'Bring card', eventId: mine.id })
		);
		expect(created.eventId).toBe(mine.id);

		await expect(
			createTask(ctx, actor, TaskCreateBody.parse({ title: 'x', eventId: 'no-such-event' }))
		).rejects.toMatchObject({ status: 400, message: 'Event not found' });
		await expect(
			createTask(ctx, actor, TaskCreateBody.parse({ title: 'x', eventId: theirs.id }))
		).rejects.toMatchObject({ status: 403, message: 'No access to this event' });
	});

	rollbackTest('assigning another member starts a pending handoff and alerts them once', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		const ctx = testCtx({ db, now: NOW });

		const created = await createTask(
			ctx,
			actorFromUser(mia, 'session'),
			TaskCreateBody.parse({ title: 'Take out bins', familyId: home.id, assignedTo: sam.id })
		);

		expect(created).toMatchObject({ assignedTo: sam.id, assignmentStatus: 'pending' });
		const alerts = await alertsOf(db, sam.id);
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toMatchObject({
			type: 'assignment_pending',
			actorName: 'Mia',
			message: "Mia assigned you 'Take out bins'",
			link: '/calendar/tasks'
		});
	});
});

describe('listTasks', () => {
	rollbackTest('pins overdue recurring rows to today-end in the stored zone, and sorts tags', async (db) => {
		const { mia, home } = await seedHousehold(db);
		await seedUserZone(db, mia.id, 'Pacific/Kiritimati');
		const stale = await seedTask(db, {
			title: 'Water plants',
			userId: mia.id,
			familyId: home.id,
			dueDate: '2026-02-27 10:00:00+00',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1
		});
		await seedTaskTags(db, stale.id, ['zeta', 'alpha']);
		const ctx = testCtx({ db, now: NOW });

		const rows = (await listTasks(ctx, actorFromUser(mia, 'session'))) as readonly TaskListRow[];

		expect(rows).toHaveLength(1);
		// 2026-03-01T23:59:00+14:00 is 2026-03-01T09:59:00Z — the owner's day, not the server's.
		expect(rows[0].dueDate).toBe('2026-03-01 09:59:00+00');
		expect(rows[0].tags).toEqual(['alpha', 'zeta']);
		expect(rows[0].eventCalendarId).toBeNull();
		expect(rows[0].phoneFocusMinutes).toBe(0);
	});

	rollbackTest('hides another member`s private family row, and shows it to its assignee (Q-005a)', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		const other = await seedUser(db, { firstName: 'Ada' });
		await seedTask(db, {
			title: 'Sam private',
			userId: sam.id,
			familyId: home.id,
			visibility: 'private'
		});
		const handedOver = await seedTask(db, {
			title: 'Sam private, mine to do',
			userId: sam.id,
			familyId: home.id,
			visibility: 'private',
			assignedTo: mia.id,
			assignmentStatus: 'accepted'
		});
		await seedTask(db, { title: 'Ada personal', userId: other.id });
		const ctx = testCtx({ db, now: NOW });

		const rows = (await listTasks(ctx, actorFromUser(mia, 'session'))) as readonly TaskListRow[];

		expect(rows.map((row) => row.title)).toEqual(['Sam private, mine to do']);
		expect(rows[0].id).toBe(handedOver.id);
	});

	rollbackTest('overlays the caller`s phone sessions and names the assignee', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		const task = await seedTask(db, {
			title: 'Paint',
			userId: mia.id,
			familyId: home.id,
			assignedTo: sam.id,
			assignmentStatus: 'accepted'
		});
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date('2026-03-01T08:00:00Z'),
			endedAt: new Date('2026-03-01T08:05:30Z')
		});
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date('2026-03-01T08:40:00Z')
		});
		const ctx = testCtx({ db, now: NOW });

		const rows = (await listTasks(ctx, actorFromUser(mia, 'session'))) as readonly TaskListRow[];

		expect(rows[0].assigneeFirstName).toBe('Sam');
		expect(rows[0].assigneeLastName).toBe('Diaz');
		expect(rows[0].phoneFocusMinutes).toBe(5);
		expect(rows[0].phoneFocusStartedAt).toEqual(new Date('2026-03-01T08:40:00Z'));
	});

	rollbackTest('?eventId= answers the list shape, hides another member`s private row and never pins (Q-055)', async (db) => {
		const { mia, sam } = await seedHousehold(db);
		const event = await seedEvent(db, { ownerId: mia.id, title: 'Trip', start: NOW });
		const pack = await seedTask(db, {
			title: 'Pack',
			userId: mia.id,
			eventId: event.id,
			createdAt: new Date('2026-01-01T00:00:00Z')
		});
		await seedTaskTags(db, pack.id, ['travel']);
		await seedTask(db, {
			title: 'Sam private',
			userId: sam.id,
			eventId: event.id,
			visibility: 'private'
		});
		await seedTask(db, {
			title: 'Stale recurring',
			userId: mia.id,
			eventId: event.id,
			createdAt: new Date('2026-01-02T00:00:00Z'),
			dueDate: '2026-02-01 10:00:00+00',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1
		});
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		const rows = (await listTasks(ctx, actor, { eventId: event.id })) as readonly TaskListRow[];

		expect(rows.map((row) => row.title)).toEqual(['Pack', 'Stale recurring']);
		// The list shape: tags, names and the Event's own attribution.
		expect(rows[0]).toMatchObject({
			tags: ['travel'],
			assigneeFirstName: null,
			eventTitle: 'Trip',
			eventCalendarId: null,
			phoneFocusMinutes: 0
		});
		expect(rows[1].dueDate).toBe('2026-02-01 10:00:00+00');

		expect(await listTasks(ctx, actor, { eventId: 'no-such-event' })).toEqual([]);
	});

	rollbackTest('?eventId= answers 403 No access to this event for someone else`s event', async (db) => {
		const { mia } = await seedHousehold(db);
		const outsider = await seedUser(db, { firstName: 'Eve' });
		const theirs = await seedEvent(db, { ownerId: outsider.id, title: 'Private', start: NOW });
		const ctx = testCtx({ db, now: NOW });

		await expect(
			listTasks(ctx, actorFromUser(mia, 'session'), { eventId: theirs.id })
		).rejects.toMatchObject({ status: 403, message: 'No access to this event' });
	});
});

describe('listTaskSections', () => {
	rollbackTest('returns the three queues with names and the section shape, pinning first', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		await seedTask(db, {
			title: 'To accept',
			userId: sam.id,
			familyId: home.id,
			assignedTo: mia.id,
			assignmentStatus: 'pending'
		});
		const accepted = await seedTask(db, {
			title: 'Mine now',
			userId: sam.id,
			familyId: home.id,
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			dueDate: '2026-02-27 10:00:00+00',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1
		});
		await seedTask(db, {
			title: 'Asked out',
			userId: mia.id,
			familyId: home.id,
			assignedTo: sam.id,
			assignmentStatus: 'pending'
		});
		await seedTask(db, {
			title: 'Archived',
			userId: mia.id,
			familyId: home.id,
			assignedTo: sam.id,
			archivedAt: '2026-02-01 00:00:00+00'
		});
		const ctx = testCtx({ db, now: NOW });

		const sections = await listTaskSections(ctx, actorFromUser(mia, 'session'));

		expect(sections.warnings).toEqual([]);
		expect(sections.myTasks.map((row) => row.title)).toEqual(['Mine now']);
		expect(sections.pendingAssignments.map((row) => row.title)).toEqual(['To accept']);
		expect(sections.requestedByMe.map((row) => row.title)).toEqual(['Asked out']);
		const row: TaskSectionRow = sections.pendingAssignments[0];
		expect(row).toMatchObject({ creatorFirstName: 'Sam', assigneeFirstName: 'Mia' });
		expect('eventCalendarId' in row).toBe(false);
		expect('phoneFocusMinutes' in row).toBe(false);
		// The main-list leg pinned the accepted recurring row before the reads.
		expect(sections.myTasks[0].dueDate).toBe('2026-03-01 23:59:00+00');
	});
});

describe('listFamilyTasks', () => {
	rollbackTest('reads the readable family rows plus the members` public personal rows, and 404s a non-member', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		const outsider = await seedUser(db, { firstName: 'Ada' });
		await seedTask(db, { title: 'Family chore', userId: sam.id, familyId: home.id });
		// Q-005a: a private Family Task reaches the board only for its owner and
		// its assignee.
		const secret = await seedTask(db, {
			title: 'Sam private chore',
			userId: sam.id,
			familyId: home.id,
			visibility: 'private'
		});
		const handedOver = await seedTask(db, {
			title: 'Sam private chore, mine',
			userId: sam.id,
			familyId: home.id,
			visibility: 'private',
			assignedTo: mia.id,
			assignmentStatus: 'accepted'
		});
		await seedTask(db, { title: 'Sam public', userId: sam.id, visibility: 'public' });
		await seedTask(db, { title: 'Sam private', userId: sam.id, visibility: 'private' });
		await seedTask(db, { title: 'Ada public', userId: outsider.id, visibility: 'public' });
		const ctx = testCtx({ db, now: NOW });

		const board = await listFamilyTasks(ctx, actorFromUser(mia, 'session'), {
			familyId: home.id
		});

		expect(board.familyTasks.map((row) => row.title).sort()).toEqual([
			'Family chore',
			'Sam private chore, mine'
		]);
		expect(board.familyTasks.map((row) => row.id)).not.toContain(secret.id);
		expect(board.familyTasks.map((row) => row.id)).toContain(handedOver.id);
		expect(board.publicTasks.map((row) => row.title)).toEqual(['Sam public']);
		expect(board.publicTasks[0]).toMatchObject({ creatorFirstName: 'Sam' });

		// The owner still reads their own private Family Task.
		const samsBoard = await listFamilyTasks(ctx, actorFromUser(sam, 'session'), {
			familyId: home.id
		});
		expect(samsBoard.familyTasks.map((row) => row.id)).toContain(secret.id);
		expect(samsBoard.familyTasks).toHaveLength(3);

		await expect(
			listFamilyTasks(ctx, actorFromUser(outsider, 'session'), { familyId: home.id })
		).rejects.toMatchObject({ status: 404, message: 'Family not found' });
	});
});

describe('updateTask field patch', () => {
	rollbackTest('dispatches undo before toggle and never applies the field patch', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedTask(db, {
			title: 'Water',
			userId: mia.id,
			dueDate: '2026-03-01 00:00:00+00',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			completionCount: 1
		});
		await seedTaskCompletion(db, {
			taskId: task.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-01-10 00:00:00+00'
		});
		const ctx = testCtx({ db, now: NOW });

		const result = await updateTask(ctx, actorFromUser(mia, 'session'), {
			taskId: task.id,
			body: TaskUpdateBody.parse({ undoComplete: true, toggleComplete: true, title: 'changed' })
		});

		expect(result).toMatchObject({
			title: 'Water',
			dueDate: '2026-02-28 00:00:00+00',
			completionCount: 0
		});
	});

	rollbackTest('dispatches toggle before the field patch', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedTask(db, { title: 'Paint', userId: mia.id });
		const ctx = testCtx({ db, now: NOW });

		const result = await updateTask(ctx, actorFromUser(mia, 'session'), {
			taskId: task.id,
			body: TaskUpdateBody.parse({ toggleComplete: true, title: 'changed' })
		});

		expect(result).toMatchObject({ title: 'Paint', completedAt: '2026-03-01 09:00:00+00' });
	});

	rollbackTest('keeps visibility owner-only and validates it before any lookup', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		const task = await seedTask(db, { title: 'Shared', userId: mia.id, familyId: home.id });
		const ctx = testCtx({ db, now: NOW });

		await expect(
			updateTask(ctx, actorFromUser(sam, 'session'), {
				taskId: task.id,
				body: TaskUpdateBody.parse({ visibility: 'private' })
			})
		).rejects.toMatchObject({ status: 403, message: 'Only the task owner can change visibility' });

		const rows = await db.select().from(tasks).where(eq(tasks.id, task.id));
		expect(rows[0].visibility).toBe('public');
	});

	rollbackTest('lets a family member edit plain fields, and answers 404 without rights', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		const outsider = await seedUser(db, { firstName: 'Ada' });
		const task = await seedTask(db, { title: 'Chore', userId: mia.id, familyId: home.id });
		const personal = await seedTask(db, { title: 'Mine', userId: mia.id });
		const ctx = testCtx({ db, now: NOW });

		const edited = await updateTask(ctx, actorFromUser(sam, 'session'), {
			taskId: task.id,
			body: TaskUpdateBody.parse({ title: 'Chore done', tags: ['home'] })
		});
		expect(edited).toMatchObject({ title: 'Chore done', tags: ['home'] });

		await expect(
			updateTask(ctx, actorFromUser(outsider, 'session'), {
				taskId: personal.id,
				body: TaskUpdateBody.parse({ title: 'hijack' })
			})
		).rejects.toMatchObject({ status: 404, message: 'Task not found' });
	});

	rollbackTest('moves an assignment: accept and decline alert the owner, a non-assignee gets 403', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		const other = await seedUser(db, { firstName: 'Ada' });
		await addMember(db, other.id, home.id, 'member');
		const task = await seedTask(db, {
			title: 'Bins',
			userId: mia.id,
			familyId: home.id,
			assignedTo: sam.id,
			assignmentStatus: 'pending'
		});
		const ctx = testCtx({ db, now: NOW });

		const accepted = await updateTask(ctx, actorFromUser(sam, 'session'), {
			taskId: task.id,
			body: TaskUpdateBody.parse({ assignmentStatus: 'accepted' })
		});
		expect(accepted).toMatchObject({ assignmentStatus: 'accepted' });
		const acceptAlert = await alertsOf(db, mia.id);
		expect(acceptAlert[0]).toMatchObject({
			type: 'assignment_accepted',
			actorName: 'Sam',
			message: "Sam accepted 'Bins'"
		});

		await expect(
			updateTask(ctx, actorFromUser(other, 'session'), {
				taskId: task.id,
				body: TaskUpdateBody.parse({ assignmentStatus: 'declined' })
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You can only respond to your own assignments'
		});

		const declined = await updateTask(ctx, actorFromUser(sam, 'session'), {
			taskId: task.id,
			body: TaskUpdateBody.parse({ assignmentStatus: 'declined' })
		});
		expect(declined).toMatchObject({ assignedTo: null, assignmentStatus: 'none' });
		const alerts = await alertsOf(db, mia.id);
		expect(alerts.map((alert) => alert.type)).toEqual([
			'assignment_accepted',
			'assignment_declined'
		]);
	});

	rollbackTest('re-sending the stored assignee is a no-op; a reassignment outside the family is a 400', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		const outsider = await seedUser(db, { firstName: 'Ada' });
		const task = await seedTask(db, {
			title: 'Bins',
			userId: mia.id,
			familyId: home.id,
			assignedTo: sam.id,
			assignmentStatus: 'accepted'
		});
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		const same = await updateTask(ctx, actor, {
			taskId: task.id,
			body: TaskUpdateBody.parse({ assignedTo: sam.id, title: 'Bins out' })
		});
		expect(same).toMatchObject({ assignedTo: sam.id, assignmentStatus: 'accepted' });
		expect(await alertsOf(db, sam.id)).toEqual([]);

		await expect(
			updateTask(ctx, actor, {
				taskId: task.id,
				body: TaskUpdateBody.parse({ assignedTo: outsider.id })
			})
		).rejects.toMatchObject({ status: 400, message: 'Assignee is not a member of this family' });

		const cleared = await updateTask(ctx, actor, {
			taskId: task.id,
			body: TaskUpdateBody.parse({ assignedTo: null })
		});
		expect(cleared).toMatchObject({ assignedTo: null, assignmentStatus: 'none' });
	});

	rollbackTest('rides an interval alone, clears both with a null frequency and defaults a new one to 1', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedTask(db, {
			title: 'Water',
			userId: mia.id,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2
		});
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		expect(
			await updateTask(ctx, actor, {
				taskId: task.id,
				body: TaskUpdateBody.parse({ recurrenceInterval: 3 })
			})
		).toMatchObject({ recurrenceFrequency: 'weekly', recurrenceInterval: 3 });

		expect(
			await updateTask(ctx, actor, {
				taskId: task.id,
				body: TaskUpdateBody.parse({ recurrenceFrequency: null })
			})
		).toMatchObject({ recurrenceFrequency: null, recurrenceInterval: null });

		expect(
			await updateTask(ctx, actor, {
				taskId: task.id,
				body: TaskUpdateBody.parse({ recurrenceFrequency: 'daily' })
			})
		).toMatchObject({ recurrenceFrequency: 'daily', recurrenceInterval: 1 });
	});

	rollbackTest('never wipes focusMinutes on an absent field and overwrites an explicit one', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedTask(db, { title: 'Focus', userId: mia.id, focusMinutes: 30 });
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		expect(
			await updateTask(ctx, actor, {
				taskId: task.id,
				body: TaskUpdateBody.parse({ title: 'Focus 2' })
			})
		).toMatchObject({ focusMinutes: 30 });
		expect(
			await updateTask(ctx, actor, {
				taskId: task.id,
				body: TaskUpdateBody.parse({ focusMinutes: 45 })
			})
		).toMatchObject({ focusMinutes: 45 });
	});

	rollbackTest('sets and clears the category, and writes a raw completedAt directly', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedTask(db, { title: 'Report', userId: mia.id });
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		const set = await updateTask(ctx, actor, {
			taskId: task.id,
			body: TaskUpdateBody.parse({ category: 'Work', completedAt: '2026-02-01T10:00:00.000Z' })
		});
		expect(set.category).toBe('Work');
		expect((set as TaskWithTagsRow).tags).toEqual([]);
		const rows = await db.select().from(tasks).where(eq(tasks.id, task.id));
		expect(rows[0].completedAt).toBe('2026-02-01 10:00:00+00');

		expect(
			await updateTask(ctx, actor, {
				taskId: task.id,
				body: TaskUpdateBody.parse({ category: null })
			})
		).toMatchObject({ category: null });
	});

	rollbackTest('replaces the tag set only when the body sends one', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedTask(db, { title: 'Trip', userId: mia.id });
		await seedTaskTags(db, task.id, ['old']);
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		expect(
			await updateTask(ctx, actor, {
				taskId: task.id,
				body: TaskUpdateBody.parse({ title: 'Trip 2' })
			})
		).toMatchObject({ tags: ['old'] });
		expect(
			await updateTask(ctx, actor, {
				taskId: task.id,
				body: TaskUpdateBody.parse({ tags: ['New', 'new'] })
			})
		).toMatchObject({ tags: ['new'] });
	});
});

describe('deleteTask and clearCompletedTasks', () => {
	rollbackTest('hard-deletes an open task and archives a completed one', async (db) => {
		const { mia } = await seedHousehold(db);
		const open = await seedTask(db, { title: 'Open', userId: mia.id });
		const done = await seedTask(db, {
			title: 'Done',
			userId: mia.id,
			completedAt: '2026-02-01 00:00:00+00'
		});
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		await deleteTask(ctx, actor, { taskId: open.id });
		await deleteTask(ctx, actor, { taskId: done.id });

		const rows = await db.select().from(tasks).where(eq(tasks.userId, mia.id));
		expect(rows).toHaveLength(1);
		expect(rows[0].title).toBe('Done');
		expect(rows[0].archivedAt).not.toBeNull();
	});

	rollbackTest('answers 404 for an unknown task and for one the caller may not touch', async (db) => {
		const { mia } = await seedHousehold(db);
		const stranger = await seedUser(db, { firstName: 'Ada' });
		const task = await seedTask(db, { title: 'Mine', userId: mia.id });
		const ctx = testCtx({ db, now: NOW });

		await expect(
			deleteTask(ctx, actorFromUser(stranger, 'session'), { taskId: task.id })
		).rejects.toMatchObject({ status: 404, message: 'Task not found' });
		await expect(
			deleteTask(ctx, actorFromUser(mia, 'session'), { taskId: 'no-such-task' })
		).rejects.toMatchObject({ status: 404, message: 'Task not found' });
	});

	rollbackTest('archives the caller`s completed rows and their accepted assignments, keeping every other row', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		const mine = await seedTask(db, {
			title: 'Mine done',
			userId: mia.id,
			completedAt: '2026-02-01 00:00:00+00'
		});
		const open = await seedTask(db, { title: 'Mine open', userId: mia.id });
		const assignment = await seedTask(db, {
			title: 'Their done, mine accepted',
			userId: sam.id,
			familyId: home.id,
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			completedAt: '2026-02-01 00:00:00+00'
		});
		const pending = await seedTask(db, {
			title: 'Their done, not answered',
			userId: sam.id,
			familyId: home.id,
			assignedTo: mia.id,
			assignmentStatus: 'pending',
			completedAt: '2026-02-01 00:00:00+00'
		});
		const ctx = testCtx({ db, now: NOW });

		const archived = await clearCompletedTasks(ctx, actorFromUser(mia, 'session'));

		// Q-059: own row + the assignment the caller accepted.
		expect(archived).toBe(2);
		const rows = await db
			.select()
			.from(tasks)
			.where(and(eq(tasks.userId, mia.id), eq(tasks.id, mine.id)));
		expect(rows[0].archivedAt).toBe('2026-03-01 09:00:00+00');
		const kept = await db.select().from(tasks).where(eq(tasks.id, assignment.id));
		expect(kept[0].archivedAt).toBe('2026-03-01 09:00:00+00');
		const [pendingRow] = await db.select().from(tasks).where(eq(tasks.id, pending.id));
		expect(pendingRow.archivedAt).toBeNull();
		const [openRow] = await db.select().from(tasks).where(eq(tasks.id, open.id));
		expect(openRow.archivedAt).toBeNull();
	});
});

describe('unassignMemberTasks', () => {
	rollbackTest('clears the removed member`s family assignments only', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		const other = await seedTaskFamily(db, 'Other');
		await addMember(db, sam.id, other.id);
		const theirs = await seedTask(db, {
			title: 'Family chore',
			userId: mia.id,
			familyId: home.id,
			assignedTo: sam.id,
			assignmentStatus: 'accepted'
		});
		const elsewhere = await seedTask(db, {
			title: 'Other chore',
			userId: mia.id,
			familyId: other.id,
			assignedTo: sam.id,
			assignmentStatus: 'pending'
		});
		const ctx = testCtx({ db, now: NOW });

		await unassignMemberTasks(ctx, home.id, sam.id);

		const [cleared] = await db.select().from(tasks).where(eq(tasks.id, theirs.id));
		expect(cleared).toMatchObject({ assignedTo: null, assignmentStatus: 'none' });
		const [untouched] = await db.select().from(tasks).where(eq(tasks.id, elsewhere.id));
		expect(untouched).toMatchObject({ assignedTo: sam.id, assignmentStatus: 'pending' });
	});
});
