/**
 * Golden contract tests for the tasks read/create endpoints:
 * `GET|POST /api/tasks`, `GET /api/tasks/sections`, `DELETE /api/tasks/completed`,
 * the `/api/task-categories` CRUD and `GET /api/stats`.
 *
 * They pin TODAY's legacy wire (docs/rewrite/playbooks/characterize-endpoints.md).
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	calendars,
	events,
	families,
	familyMembers,
	notifications,
	taskCategories,
	taskCompletions,
	taskfocusSessions,
	tasks,
	taskTags,
	userSettings
} from '$lib/kernel/db/tables.server';
import type { Db } from '$lib/kernel/db/database.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
// Route modules, not actions: after the port these re-export the new handlers,
// so the imports never change (characterize-endpoints.md).
import { GET as getTasks, POST as postTask } from '../../../routes/api/tasks/+server';
import { GET as getSections } from '../../../routes/api/tasks/sections/+server';
import { DELETE as clearCompleted } from '../../../routes/api/tasks/completed/+server';
import { GET as getStats } from '../../../routes/api/stats/+server';
import {
	GET as getCategories,
	POST as postCategory
} from '../../../routes/api/task-categories/+server';
import {
	DELETE as deleteCategory,
	PATCH as patchCategory
} from '../../../routes/api/task-categories/[id]/+server';

const ctx = () => testCtx({ db: testDb() });
const ISO = /^\d{4}-\d{2}-\d{2}T/;

async function seedFamily(db: Db, name = 'Home') {
	const [row] = await db.insert(families).values({ name }).returning();
	return row;
}

async function addMember(
	db: Db,
	userId: string,
	familyId: string,
	role = 'member',
	memberType = 'member'
) {
	await db.insert(familyMembers).values({ userId, familyId, role, memberType });
}

async function seedCalendar(db: Db, values: typeof calendars.$inferInsert) {
	const [row] = await db.insert(calendars).values(values).returning();
	return row;
}

async function seedEvent(db: Db, values: typeof events.$inferInsert) {
	const [row] = await db.insert(events).values(values).returning();
	return row;
}

async function seedTask(
	db: Db,
	values: Omit<typeof tasks.$inferInsert, 'title' | 'userId'> & { title: string; userId: string }
) {
	const [row] = await db.insert(tasks).values(values).returning();
	return row;
}

async function seedCategory(db: Db, userId: string, name: string) {
	const [row] = await db.insert(taskCategories).values({ userId, name }).returning();
	return row;
}

describe('GET /api/tasks', () => {
	beforeEach(truncateAll);

	it('returns the caller`s task with tags, event calendar and phone focus', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, {
			title: 'Buy milk',
			notes: '2 litres',
			dueDate: '2026-02-01T10:00:00.000Z',
			priority: 'high',
			visibility: 'private',
			focusMinutes: 12,
			category: 'Errands',
			createdAt: new Date('2026-01-02T00:00:00.000Z'),
			userId: mia.id
		});
		await db.insert(taskTags).values([
			{ taskId: task.id, name: 'milk' },
			{ taskId: task.id, name: 'shopping' }
		]);
		// Two closed 90 s phone sessions floor to 3 minutes (#293), an absorbed
		// one and another user's one are ignored.
		const sam = await seedUser(db, { firstName: 'Sam' });
		await db.insert(taskfocusSessions).values([
			{
				userId: mia.id,
				taskId: task.id,
				startedAt: new Date('2026-01-03T10:00:00.000Z'),
				endedAt: new Date('2026-01-03T10:01:30.000Z')
			},
			{
				userId: mia.id,
				taskId: task.id,
				startedAt: new Date('2026-01-04T10:00:00.000Z'),
				endedAt: new Date('2026-01-04T10:01:30.000Z')
			},
			{
				userId: mia.id,
				taskId: task.id,
				startedAt: new Date('2026-01-05T10:00:00.000Z'),
				endedAt: new Date('2026-01-05T10:05:00.000Z'),
				absorbedAt: new Date('2026-01-06T10:00:00.000Z')
			},
			{
				userId: sam.id,
				taskId: task.id,
				startedAt: new Date('2026-01-07T10:00:00.000Z'),
				endedAt: new Date('2026-01-07T10:09:00.000Z')
			}
		]);

		const res = await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			tasks: [
				{
					id: task.id,
					title: 'Buy milk',
					notes: '2 litres',
					dueDate: expect.stringMatching(/^2026-02-01/),
					completedAt: null,
					archivedAt: null,
					recurrenceFrequency: null,
					recurrenceInterval: null,
					completionCount: 0,
					assignedTo: null,
					assignmentStatus: 'none',
					priority: 'high',
					visibility: 'private',
					focusMinutes: 12,
					focusStartedAt: null,
					category: 'Errands',
					assigneeFirstName: null,
					assigneeLastName: null,
					userId: mia.id,
					familyId: null,
					eventId: null,
					createdAt: expect.stringMatching(ISO),
					eventTitle: null,
					eventStart: null,
					eventCalendarId: null,
					tags: ['milk', 'shopping'],
					phoneFocusMinutes: 3,
					phoneFocusStartedAt: null
				}
			]
		});
	});

	it('orders newest createdAt first and drops archived tasks', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const older = await seedTask(db, {
			title: 'Older',
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			userId: mia.id
		});
		const newer = await seedTask(db, {
			title: 'Newer',
			createdAt: new Date('2026-01-03T00:00:00.000Z'),
			userId: mia.id
		});
		await seedTask(db, {
			title: 'Archived',
			createdAt: new Date('2026-01-04T00:00:00.000Z'),
			archivedAt: '2026-01-05T00:00:00.000Z',
			userId: mia.id
		});

		const res = await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });

		expect(res.body).toEqual({
			tasks: [
				expect.objectContaining({ id: newer.id, title: 'Newer' }),
				expect.objectContaining({ id: older.id, title: 'Older' })
			]
		});
	});

	it('includes every row of the caller`s family, another member`s private one too (Q-005a)', async () => {
		// TODAY's wire: the family leg of getTasksForUser ignores visibility, so a
		// member's PRIVATE family task reaches the other member. Q-005a fixes this
		// after S6 (`fix(tasks): Q-005a hide private tasks from family reads`) and
		// changes exactly this golden.
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		const secret = await seedTask(db, {
			title: 'Sam`s secret',
			visibility: 'private',
			familyId: family.id,
			userId: sam.id
		});
		await seedTask(db, {
			title: 'Sam`s personal',
			familyId: null,
			userId: sam.id
		});

		const res = await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });

		expect(res.body).toEqual({
			tasks: [expect.objectContaining({ id: secret.id, title: 'Sam`s secret' })]
		});
	});

	it('answers 200 {tasks:[]} for an unknown eventId', async () => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });
		const res = await invoke(getTasks, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			query: { eventId: 'no-such-event' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ tasks: [] });
	});

	it('answers 403 No access to this event for someone else`s event', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const event = await seedEvent(db, {
			ownerId: sam.id,
			title: 'Dentist',
			start: '2026-03-01T09:00:00.000Z'
		});

		const res = await invoke(getTasks, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			query: { eventId: event.id }
		});

		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'No access to this event' });
	});

	it('lists an accessible event`s tasks, hides another member`s private one (#164)', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedFamily(db);
		await addMember(db, mia.id, family.id);
		const calendar = await seedCalendar(db, { familyId: family.id });
		const event = await seedEvent(db, {
			ownerId: sam.id,
			calendarId: calendar.id,
			title: 'Dentist',
			start: '2026-03-01T09:00:00.000Z'
		});
		const mine = await seedTask(db, {
			title: 'Bring forms',
			eventId: event.id,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			userId: mia.id
		});
		const samsPublic = await seedTask(db, {
			title: 'Sam`s public',
			eventId: event.id,
			createdAt: new Date('2026-01-02T00:00:00.000Z'),
			userId: sam.id
		});
		await seedTask(db, {
			title: 'Sam`s private',
			visibility: 'private',
			eventId: event.id,
			createdAt: new Date('2026-01-03T00:00:00.000Z'),
			userId: sam.id
		});

		const res = await invoke(getTasks, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			query: { eventId: event.id }
		});

		expect(res.status).toBe(200);
		// The event branch returns the raw task row shape (no tags / eventTitle /
		// assignee names) plus the three derived fields — two shapes on one route.
		expect(res.body).toEqual({
			tasks: [
				{
					id: mine.id,
					title: 'Bring forms',
					notes: null,
					dueDate: null,
					completedAt: null,
					archivedAt: null,
					recurrenceFrequency: null,
					recurrenceInterval: null,
					completionCount: 0,
					assignedTo: null,
					assignmentStatus: 'none',
					priority: 'normal',
					visibility: 'public',
					userId: mia.id,
					familyId: null,
					eventId: event.id,
					focusMinutes: null,
					focusStartedAt: null,
					category: null,
					createdAt: expect.stringMatching(ISO),
					eventCalendarId: calendar.id,
					phoneFocusMinutes: 0,
					phoneFocusStartedAt: null
				},
				expect.objectContaining({ id: samsPublic.id, title: 'Sam`s public' })
			]
		});
	});

	it('pins overdue recurring rows to today-end in the token owner`s stored zone (#214)', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		await db.insert(userSettings).values({ userId: mia.id, timeZone: 'Pacific/Kiritimati' });
		const stale = await seedTask(db, {
			title: 'Water plants',
			dueDate: '2020-01-01T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			userId: mia.id
		});

		await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });

		const [row] = await db.select().from(tasks).where(eq(tasks.id, stale.id));
		const pinned = DateTime.fromJSDate(new Date(row.dueDate ?? '')).setZone('Pacific/Kiritimati');
		expect(pinned.toISODate()).toBe(DateTime.now().setZone('Pacific/Kiritimati').toISODate());
		expect([pinned.hour, pinned.minute]).toEqual([23, 59]);
		expect(row.completionCount).toBe(0);
		expect(await db.select().from(taskCompletions)).toEqual([]);
	});

	it('pins the family leg too, so another member`s cursor is not left stale', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		const familyTask = await seedTask(db, {
			title: 'Family plants',
			dueDate: '2020-01-01T00:00:00.000Z',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			familyId: family.id,
			userId: sam.id
		});

		await invoke(getTasks, { ctx: ctx(), user: mia, path: '/api/tasks' });

		const [row] = await db.select().from(tasks).where(eq(tasks.id, familyTask.id));
		const pinned = DateTime.fromJSDate(new Date(row.dueDate ?? ''));
		expect(pinned.toISODate()).toBe(DateTime.now().startOf('day').toISODate());
		expect(pinned.hour).toBe(23);
	});
});

describe('POST /api/tasks', () => {
	beforeEach(truncateAll);

	it('creates a task with normalized tags, defaults and an auto-added category', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const family = await seedFamily(db);
		await addMember(db, mia.id, family.id);

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: {
				title: '  Buy milk  ',
				notes: ' 2 litres ',
				dueDate: '2026-02-01T10:00:00.000Z',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 2.7,
				tags: [' Shopping', 'milk', 'MILK', ' '],
				category: 'Errands',
				focusMinutes: 30,
				focusStartedAt: null
			}
		});

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			success: true,
			task: {
				id: expect.any(String),
				title: 'Buy milk',
				notes: ' 2 litres ',
				dueDate: expect.stringMatching(/^2026-02-01/),
				completedAt: null,
				archivedAt: null,
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 2,
				completionCount: 0,
				assignedTo: mia.id,
				assignmentStatus: 'accepted',
				priority: 'normal',
				visibility: 'public',
				userId: mia.id,
				familyId: family.id,
				eventId: null,
				focusMinutes: 30,
				focusStartedAt: null,
				category: 'Errands',
				createdAt: expect.stringMatching(ISO),
				tags: ['milk', 'shopping']
			}
		});
		const categories = await db
			.select()
			.from(taskCategories)
			.where(eq(taskCategories.userId, mia.id));
		expect(categories.map((row) => row.name)).toEqual(['Errands']);
	});

	it('reads an absent familyId as the caller`s family and an explicit null as personal', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const family = await seedFamily(db);
		await addMember(db, mia.id, family.id);

		await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Family chore' }
		});
		await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Personal chore', familyId: null }
		});

		const rows = await db.select().from(tasks);
		const familyByTitle = new Map(rows.map((row) => [row.title, row.familyId]));
		expect(familyByTitle.get('Family chore')).toBe(family.id);
		expect(familyByTitle.get('Personal chore')).toBeNull();
	});

	it('defaults visibility to public and rejects an explicit null or unknown value', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });

		const ok = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Public by default' }
		});
		expect(ok.status).toBe(201);
		expect(ok.body).toEqual({
			success: true,
			task: expect.objectContaining({ visibility: 'public', assignmentStatus: 'accepted' })
		});

		for (const visibility of [null, 'secret']) {
			const res = await invoke(postTask, {
				ctx: ctx(),
				user: mia,
				path: '/api/tasks',
				method: 'POST',
				body: { title: 'Nope', visibility }
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invalid visibility' });
		}
	});

	it('assigning another family member starts a pending handoff and alerts them', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Plan trip', assignedTo: sam.id }
		});

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			success: true,
			task: expect.objectContaining({
				assignedTo: sam.id,
				assignmentStatus: 'pending',
				familyId: family.id
			})
		});
		const alerts = await db.select().from(notifications);
		expect(alerts).toEqual([
			expect.objectContaining({
				userId: sam.id,
				type: 'assignment_pending',
				actorName: 'Mia',
				message: "Mia assigned you 'Plan trip'",
				link: '/calendar/tasks',
				readAt: null
			})
		]);
	});

	it('rejects an assignee outside the family and a family the caller is not in', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedFamily(db);
		await addMember(db, mia.id, family.id);
		const otherFamily = await seedFamily(db, 'Other');

		const notMember = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'X', assignedTo: sam.id }
		});
		expect(notMember.status).toBe(400);
		expect(notMember.body).toEqual({ error: 'Assignee is not a member of this family' });

		const notMyFamily = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'X', familyId: otherFamily.id }
		});
		expect(notMyFamily.status).toBe(403);
		expect(notMyFamily.body).toEqual({ error: 'Not a member of this family' });
	});

	it('rejects a bad title, dueDate and non-string eventId with the legacy 400s', async () => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });
		const cases: { body: JsonValue; error: string }[] = [
			{ body: {}, error: 'Title is required' },
			{ body: { title: '   ' }, error: 'Title is required' },
			{ body: { title: 'X', dueDate: 'not-a-date' }, error: 'Invalid dueDate' },
			{ body: { title: 'X', dueDate: 7 }, error: 'Invalid dueDate' },
			{ body: { title: 'X', eventId: 7 }, error: 'Invalid eventId' }
		];
		for (const testCase of cases) {
			const res = await invoke(postTask, {
				ctx: ctx(),
				user: mia,
				path: '/api/tasks',
				method: 'POST',
				body: testCase.body
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: testCase.error });
		}
	});

	it('answers 400 Event not found and 403 No access for an unreadable event', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const event = await seedEvent(db, {
			ownerId: sam.id,
			title: 'Dentist',
			start: '2026-03-01T09:00:00.000Z'
		});

		const missing = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'X', eventId: 'no-such-event' }
		});
		expect(missing.status).toBe(400);
		expect(missing.body).toEqual({ error: 'Event not found' });

		const denied = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'X', eventId: event.id }
		});
		expect(denied.status).toBe(403);
		expect(denied.body).toEqual({ error: 'No access to this event' });
	});

	it('attaches a task to an event the caller can read through the family calendar', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedFamily(db);
		await addMember(db, mia.id, family.id);
		const calendar = await seedCalendar(db, { familyId: family.id });
		const event = await seedEvent(db, {
			ownerId: sam.id,
			calendarId: calendar.id,
			title: 'Dentist',
			start: '2026-03-01T09:00:00.000Z'
		});

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Bring forms', eventId: event.id }
		});
		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			success: true,
			task: expect.objectContaining({ eventId: event.id, familyId: family.id })
		});

		const listed = await invoke(getTasks, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			query: { eventId: event.id }
		});
		expect(listed.body).toEqual({
			tasks: [expect.objectContaining({ title: 'Bring forms', eventCalendarId: calendar.id })]
		});
	});

	it('treats an empty-string dueDate and eventId as none', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Undated', dueDate: '', eventId: '' }
		});

		expect(res.status).toBe(201);
		expect(res.body).toEqual({
			success: true,
			task: expect.objectContaining({ dueDate: null, eventId: null })
		});
	});

	it('rejects invalid focus values before writing anything', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const cases: { body: JsonValue; error: string }[] = [
			{ body: { title: 'X', focusMinutes: -1 }, error: 'Invalid focusMinutes' },
			{ body: { title: 'X', focusMinutes: 1.5 }, error: 'Invalid focusMinutes' },
			{ body: { title: 'X', focusMinutes: '30' }, error: 'Invalid focusMinutes' },
			{ body: { title: 'X', focusStartedAt: 'not-a-date' }, error: 'Invalid focusStartedAt' },
			{ body: { title: 'X', focusStartedAt: 42 }, error: 'Invalid focusStartedAt' }
		];
		for (const testCase of cases) {
			const res = await invoke(postTask, {
				ctx: ctx(),
				user: mia,
				path: '/api/tasks',
				method: 'POST',
				body: testCase.body
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: testCase.error });
		}
		expect(await db.select().from(tasks)).toEqual([]);
	});

	it('silently nulls an unknown recurrenceFrequency and floors the interval to at least 1', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });

		const unknown = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Hourly', recurrenceFrequency: 'hourly', recurrenceInterval: 3 }
		});
		expect(unknown.body).toEqual({
			success: true,
			task: expect.objectContaining({ recurrenceFrequency: null, recurrenceInterval: null })
		});

		const floored = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Daily', recurrenceFrequency: 'daily', recurrenceInterval: 0 }
		});
		expect(floored.body).toEqual({
			success: true,
			task: expect.objectContaining({ recurrenceFrequency: 'daily', recurrenceInterval: 1 })
		});
	});

	it('rejects a bad category and stores a case variant in the list`s spelling', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		await seedCategory(db, mia.id, 'Work');
		const cases: { body: JsonValue; error: string }[] = [
			{ body: { title: 'X', category: 7 }, error: 'category must be a string' },
			{ body: { title: 'X', category: 'x'.repeat(81) }, error: 'category is too long' }
		];
		for (const testCase of cases) {
			const res = await invoke(postTask, {
				ctx: ctx(),
				user: mia,
				path: '/api/tasks',
				method: 'POST',
				body: testCase.body
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: testCase.error });
		}

		const res = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Taxes', category: 'work' }
		});
		expect(res.status).toBe(201);
		expect(res.body).toEqual({ success: true, task: expect.objectContaining({ category: 'Work' }) });
		expect((await db.select().from(taskCategories)).map((row) => row.name)).toEqual(['Work']);

		const blank = await invoke(postTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks',
			method: 'POST',
			body: { title: 'Blank', category: '   ' }
		});
		expect(blank.body).toEqual({ success: true, task: expect.objectContaining({ category: null }) });
	});
});

describe('GET /api/tasks/sections', () => {
	beforeEach(truncateAll);

	it('returns the three queues with warnings', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		const mine = await seedTask(db, {
			title: 'Mine',
			createdAt: new Date('2026-01-02T00:00:00.000Z'),
			userId: mia.id
		});
		const accepted = await seedTask(db, {
			title: 'Assigned to me',
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			familyId: family.id,
			createdAt: new Date('2026-01-03T00:00:00.000Z'),
			userId: sam.id
		});
		const pending = await seedTask(db, {
			title: 'Please accept',
			assignedTo: mia.id,
			assignmentStatus: 'pending',
			familyId: family.id,
			createdAt: new Date('2026-01-04T00:00:00.000Z'),
			userId: sam.id
		});
		const requested = await seedTask(db, {
			title: 'Asked of Sam',
			assignedTo: sam.id,
			assignmentStatus: 'pending',
			familyId: family.id,
			createdAt: new Date('2026-01-05T00:00:00.000Z'),
			userId: mia.id
		});

		const res = await invoke(getSections, { ctx: ctx(), user: mia, path: '/api/tasks/sections' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			myTasks: [
				expect.objectContaining({
					id: accepted.id,
					title: 'Assigned to me',
					creatorFirstName: 'Sam',
					tags: []
				}),
				expect.objectContaining({
					id: mine.id,
					title: 'Mine',
					creatorFirstName: 'Mia'
				})
			],
			pendingAssignments: [expect.objectContaining({ id: pending.id, title: 'Please accept' })],
			requestedByMe: [expect.objectContaining({ id: requested.id, title: 'Asked of Sam' })],
			warnings: []
		});
	});

	it('drops archived rows from every section', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		await seedTask(db, {
			title: 'Archived of mine',
			archivedAt: '2026-01-01T00:00:00.000Z',
			userId: mia.id
		});

		const res = await invoke(getSections, { ctx: ctx(), user: mia, path: '/api/tasks/sections' });

		expect(res.body).toEqual({
			myTasks: [],
			pendingAssignments: [],
			requestedByMe: [],
			warnings: []
		});
	});
});

describe('DELETE /api/tasks/completed', () => {
	beforeEach(truncateAll);

	it('archives only the caller`s completed rows and keeps every other row', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const completed = await seedTask(db, {
			title: 'Done of mine',
			completedAt: '2026-01-01T00:00:00.000Z',
			userId: mia.id
		});
		const open = await seedTask(db, { title: 'Still open', userId: mia.id });
		const assigned = await seedTask(db, {
			title: 'Done, assigned to me',
			completedAt: '2026-01-02T00:00:00.000Z',
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			userId: sam.id
		});

		const res = await invoke(clearCompleted, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks/completed',
			method: 'DELETE'
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const rows = await db.select().from(tasks);
		const archived = new Map(rows.map((row) => [row.id, row.archivedAt]));
		expect(archived.get(completed.id)).not.toBeNull();
		expect(archived.get(open.id)).toBeNull();
		// TODAY's wire: the clear only archives rows the caller OWNS, so a
		// completed accepted assignment stays in the caller's list.
		expect(archived.get(assigned.id)).toBeNull();

		const sections = await invoke(getSections, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks/sections'
		});
		expect(sections.body).toEqual({
			myTasks: [expect.objectContaining({ id: assigned.id })],
			pendingAssignments: [],
			requestedByMe: [],
			warnings: []
		});
	});
});

describe('GET /api/stats', () => {
	beforeEach(truncateAll);

	it('returns the empty snapshot for a user with no completions and no family', async () => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });

		const res = await invoke(getStats, { ctx: ctx(), user: mia, path: '/api/stats' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			stats: {
				completedOnce: 0,
				recurringTasks: 0,
				recurringCompletions: 0,
				topAssigners: [],
				topAssignees: [],
				recentlyCompleted: [],
				month: { completed: 0, recurring: 0 },
				doneBy: []
			},
			streak: {
				current: 0,
				best: 0,
				freezeUsedInCurrentGap: false,
				lastCompletedWeek: null
			},
			completionIso: [],
			todayIso: expect.stringMatching(ISO),
			month: { completed: 0, recurring: 0 },
			doneBy: [],
			roster: []
		});
	});

	it('counts completions by actor with the legacy owner fallback (#092/#146)', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id, 'member', 'child');
		const first = await seedTask(db, {
			title: 'First',
			completedAt: '2026-01-01T00:00:00.000Z',
			userId: mia.id
		});
		const recurring = await seedTask(db, {
			title: 'Recurring',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			completionCount: 1,
			userId: mia.id
		});
		const legacy = await seedTask(db, { title: 'Legacy', userId: mia.id });
		const bySam = await seedTask(db, {
			title: 'Done by Sam',
			completedAt: '2026-01-02T00:00:00.000Z',
			userId: mia.id
		});
		await db.insert(taskCompletions).values([
			{ taskId: first.id, userId: mia.id, actorId: mia.id, familyId: family.id },
			{ taskId: recurring.id, userId: mia.id, actorId: mia.id, familyId: family.id },
			{ taskId: legacy.id, userId: mia.id, actorId: null, familyId: null },
			{ taskId: bySam.id, userId: mia.id, actorId: sam.id, familyId: family.id }
		]);

		const res = await invoke(getStats, { ctx: ctx(), user: mia, path: '/api/stats' });

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			stats: {
				completedOnce: 3,
				recurringTasks: 1,
				recurringCompletions: 1,
				month: { completed: 3, recurring: 1 },
				doneBy: [
					{ name: 'Mia', count: 2 },
					{ name: 'Sam', count: 1 }
				],
				recentlyCompleted: expect.arrayContaining([
					{ title: 'First', completedAt: expect.stringMatching(ISO), recurring: false },
					{ title: 'Recurring', completedAt: expect.stringMatching(ISO), recurring: true },
					{ title: 'Legacy', completedAt: expect.stringMatching(ISO), recurring: false }
				])
			},
			streak: {
				current: 1,
				best: 1,
				freezeUsedInCurrentGap: false,
				lastCompletedWeek: expect.stringMatching(/^\d{4}-W\d{2}$/)
			},
			completionIso: expect.arrayContaining([expect.stringMatching(ISO)]),
			todayIso: expect.stringMatching(ISO),
			roster: expect.arrayContaining([
				expect.objectContaining({ firstName: 'Mia' }),
				expect.objectContaining({ firstName: 'Sam', memberType: 'child' })
			])
		});
	});
});

describe('task categories', () => {
	beforeEach(truncateAll);

	it('lists the caller`s categories name-sorted case-insensitively', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const other = await seedUser(db, { firstName: 'Other' });
		const zebra = await seedCategory(db, mia.id, 'zebra');
		const home = await seedCategory(db, mia.id, 'home');
		const work = await seedCategory(db, mia.id, 'Work');
		await seedCategory(db, other.id, 'apple');

		const res = await invoke(getCategories, { ctx: ctx(), user: mia, path: '/api/task-categories' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			categories: [
				{
					id: home.id,
					name: 'home',
					createdAt: expect.stringMatching(ISO),
					updatedAt: expect.stringMatching(ISO)
				},
				{
					id: work.id,
					name: 'Work',
					createdAt: expect.stringMatching(ISO),
					updatedAt: expect.stringMatching(ISO)
				},
				{
					id: zebra.id,
					name: 'zebra',
					createdAt: expect.stringMatching(ISO),
					updatedAt: expect.stringMatching(ISO)
				}
			]
		});
	});

	it('adds a category idempotently, reusing the stored spelling for any case', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const existing = await seedCategory(db, mia.id, 'Work');

		const created = await invoke(postCategory, {
			ctx: ctx(),
			user: mia,
			path: '/api/task-categories',
			method: 'POST',
			body: { name: '  Deep Work  ' }
		});
		expect(created.status).toBe(200);
		expect(created.body).toEqual({
			category: {
				id: expect.any(String),
				name: 'Deep Work',
				createdAt: expect.stringMatching(ISO),
				updatedAt: expect.stringMatching(ISO)
			}
		});

		const again = await invoke(postCategory, {
			ctx: ctx(),
			user: mia,
			path: '/api/task-categories',
			method: 'POST',
			body: { name: 'work' }
		});
		expect(again.status).toBe(200);
		expect(again.body).toEqual({
			category: {
				id: existing.id,
				name: 'Work',
				createdAt: expect.stringMatching(ISO),
				updatedAt: expect.stringMatching(ISO)
			}
		});
		expect(await db.select().from(taskCategories)).toHaveLength(2);
	});

	it('rejects a missing, blank, non-string or over-long name (and malformed JSON)', async () => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });
		const cases: { name?: string | number; error: string }[] = [
			{ error: 'name is required' },
			{ name: '   ', error: 'name is required' },
			{ name: 7, error: 'name is required' },
			{ name: 'x'.repeat(81), error: 'name is too long' }
		];
		for (const testCase of cases) {
			const res = await invoke(postCategory, {
				ctx: ctx(),
				user: mia,
				path: '/api/task-categories',
				method: 'POST',
				body: testCase.name === undefined ? {} : { name: testCase.name }
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: testCase.error });
		}

		const malformed = await invoke(postCategory, {
			ctx: ctx(),
			user: mia,
			path: '/api/task-categories',
			method: 'POST',
			rawBody: '{'
		});
		expect(malformed.status).toBe(400);
		expect(malformed.body).toEqual({ error: 'name is required' });
	});

	it('renames the caller`s owned and assigned tasks, not another user`s', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const category = await seedCategory(db, mia.id, 'Work');
		const owned = await seedTask(db, { title: 'Owned', category: 'work', userId: mia.id });
		const assigned = await seedTask(db, {
			title: 'Assigned',
			category: 'WORK',
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			userId: sam.id
		});
		const foreign = await seedTask(db, { title: 'Foreign', category: 'Work', userId: sam.id });

		const res = await invoke(patchCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: category.id },
			method: 'PATCH',
			body: { name: 'Deep Work' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			category: {
				id: category.id,
				name: 'Deep Work',
				createdAt: expect.stringMatching(ISO),
				updatedAt: expect.stringMatching(ISO)
			}
		});
		const rows = await db.select().from(tasks);
		const byId = new Map(rows.map((row) => [row.id, row.category]));
		expect(byId.get(owned.id)).toBe('Deep Work');
		expect(byId.get(assigned.id)).toBe('Deep Work');
		expect(byId.get(foreign.id)).toBe('Work');
	});

	it('allows a case-only rename and 409s when another category owns the name', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const category = await seedCategory(db, mia.id, 'Work');
		await seedCategory(db, mia.id, 'Home');

		const caseOnly = await invoke(patchCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: category.id },
			method: 'PATCH',
			body: { name: 'WORK' }
		});
		expect(caseOnly.status).toBe(200);
		expect(caseOnly.body).toEqual({ category: expect.objectContaining({ name: 'WORK' }) });

		const clash = await invoke(patchCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: category.id },
			method: 'PATCH',
			body: { name: 'home' }
		});
		expect(clash.status).toBe(409);
		expect(clash.body).toEqual({ error: 'A category with that name already exists' });
	});

	it('answers 404 for an unknown or another user`s category, 400 for a bad name', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const sams = await seedCategory(db, sam.id, 'Sam`s');

		const unknown = await invoke(patchCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: 'no-such-category' },
			method: 'PATCH',
			body: { name: 'Work' }
		});
		expect(unknown.status).toBe(404);
		expect(unknown.body).toEqual({ error: 'Category not found' });

		const foreign = await invoke(deleteCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: sams.id },
			method: 'DELETE'
		});
		expect(foreign.status).toBe(404);
		expect(foreign.body).toEqual({ error: 'Category not found' });
		expect(await db.select().from(taskCategories)).toHaveLength(1);

		const badNames: { name?: string; error: string }[] = [
			{ error: 'name is required' },
			{ name: '', error: 'name is required' },
			{ name: 'x'.repeat(81), error: 'name is too long' }
		];
		for (const testCase of badNames) {
			const res = await invoke(patchCategory, {
				ctx: ctx(),
				user: mia,
				params: { id: sams.id },
				method: 'PATCH',
				body: testCase.name === undefined ? {} : { name: testCase.name }
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: testCase.error });
		}
	});

	it('deletes a category and clears it from the caller`s owned and assigned tasks', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const category = await seedCategory(db, mia.id, 'Work');
		const owned = await seedTask(db, { title: 'Owned', category: 'Work', userId: mia.id });
		const foreign = await seedTask(db, { title: 'Foreign', category: 'Work', userId: sam.id });

		const res = await invoke(deleteCategory, {
			ctx: ctx(),
			user: mia,
			params: { id: category.id },
			method: 'DELETE'
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await db.select().from(taskCategories)).toEqual([]);
		const rows = await db.select().from(tasks);
		const byId = new Map(rows.map((row) => [row.id, row.category]));
		expect(byId.get(owned.id)).toBeNull();
		expect(byId.get(foreign.id)).toBe('Work');
	});
});

describe('signed out', () => {
	beforeEach(truncateAll);

	it('answers 401 {"error":"Unauthorized"} on every route', async () => {
		const calls = [
			() => invoke(getTasks, { ctx: ctx(), path: '/api/tasks' }),
			() => invoke(postTask, { ctx: ctx(), path: '/api/tasks', method: 'POST', body: { title: 'X' } }),
			() => invoke(getSections, { ctx: ctx(), path: '/api/tasks/sections' }),
			() =>
				invoke(clearCompleted, { ctx: ctx(), path: '/api/tasks/completed', method: 'DELETE' }),
			() => invoke(getStats, { ctx: ctx(), path: '/api/stats' }),
			() => invoke(getCategories, { ctx: ctx(), path: '/api/task-categories' }),
			() =>
				invoke(postCategory, {
					ctx: ctx(),
					path: '/api/task-categories',
					method: 'POST',
					body: { name: 'Work' }
				}),
			() =>
				invoke(patchCategory, {
					ctx: ctx(),
					params: { id: 'x' },
					method: 'PATCH',
					body: { name: 'Work' }
				}),
			() => invoke(deleteCategory, { ctx: ctx(), params: { id: 'x' }, method: 'DELETE' })
		];
		for (const call of calls) {
			const res = await call();
			expect(res.status).toBe(401);
			expect(res.body).toEqual({ error: 'Unauthorized' });
		}
	});
});
