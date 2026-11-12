/**
 * Golden contract tests for the task mutation endpoints:
 * `PUT|DELETE /api/tasks/[id]` — the one body-dispatch route (undo, skip,
 * toggle, field patch, assignment response, focus fields, category).
 *
 * They pin TODAY's legacy wire (docs/rewrite/playbooks/characterize-endpoints.md).
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	notifications,
	taskCategories,
	taskCompletions,
	taskTags,
	tasks
} from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import { addMember, seedTaskFamily, seedTask } from './tasks.fixtures.server';
// Route module, not the action: after the port this re-exports the new handler.
import {
	DELETE as deleteTask,
	PUT as putTask
} from '../../../routes/api/tasks/[id]/+server';

const ctx = () => testCtx({ db: testDb() });
const ISO = /^\d{4}-\d{2}-\d{2}T/;
// timestamptz mode:'string' fields are rendered by Postgres, not ISO-serialized.
const PG_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?\+00$/;

/** The day legacy uses when the caller has no stored zone: UTC (`new Date().toISOString()`). */
const utcToday = () => DateTime.now().toUTC().startOf('day');

describe('PUT /api/tasks/[id] — field patches', () => {
	beforeEach(truncateAll);

	it('patches plain fields, normalizes tags and returns the whole task', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, {
			title: 'Old',
			priority: 'low',
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			userId: mia.id
		});
		await db.insert(taskTags).values({ taskId: task.id, name: 'old' });

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: {
				title: '  Renamed  ',
				notes: 'n',
				dueDate: '2026-03-03T12:00:00.000Z',
				priority: 'high',
				tags: ['Zed', 'alpha', 'ALPHA', ' ']
			}
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			task: {
				id: task.id,
				title: 'Renamed',
				notes: 'n',
				dueDate: expect.stringMatching(/^2026-03-03/),
				completedAt: null,
				archivedAt: null,
				recurrenceFrequency: null,
				recurrenceInterval: null,
				completionCount: 0,
				assignedTo: null,
				assignmentStatus: 'none',
				priority: 'high',
				visibility: 'public',
				userId: mia.id,
				familyId: null,
				eventId: null,
				focusMinutes: null,
				focusStartedAt: null,
				category: null,
				createdAt: expect.stringMatching(ISO),
				tags: ['alpha', 'zed']
			}
		});
	});

	it('falls back to normal for an unknown priority', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Plain', priority: 'high', userId: mia.id });

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { priority: 'urgent' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			task: expect.objectContaining({ priority: 'normal' })
		});
	});

	it('never wipes focusMinutes on an absent or null field, and overwrites an explicit one', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, {
			title: 'Focused',
			focusMinutes: 25,
			userId: mia.id
		});
		const stored = async () =>
			(await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].focusMinutes;

		const absent = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { title: 'First' }
		});
		expect(absent.body).toEqual({
			success: true,
			task: expect.objectContaining({ focusMinutes: 25 })
		});
		expect(await stored()).toBe(25);

		const explicitNull = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { title: 'Second', focusMinutes: null }
		});
		expect(explicitNull.body).toEqual({
			success: true,
			task: expect.objectContaining({ focusMinutes: 25 })
		});
		expect(await stored()).toBe(25);

		const overwritten = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { focusMinutes: 40 }
		});
		expect(overwritten.body).toEqual({
			success: true,
			task: expect.objectContaining({ focusMinutes: 40 })
		});
		expect(await stored()).toBe(40);

		for (const focusMinutes of [-1, 1.5, '30']) {
			const refused = await invoke(putTask, {
				ctx: ctx(),
				user: mia,
				path: `/api/tasks/${task.id}`,
				method: 'PUT',
				body: { focusMinutes }
			});
			expect(refused.status).toBe(400);
			expect(refused.body).toEqual({ error: 'Invalid focusMinutes' });
		}
		// Rejected before any mutation.
		expect(await stored()).toBe(40);
	});

	it('clears focusStartedAt only on an explicit null and validates the value', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const startedAt = new Date('2026-01-01T08:00:00.000Z');
		const task = await seedTask(db, {
			title: 'Running',
			focusStartedAt: startedAt,
			userId: mia.id
		});
		const stored = async () =>
			(await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].focusStartedAt;

		await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { title: 'Still running' }
		});
		expect((await stored())?.toISOString()).toBe(startedAt.toISOString());

		const invalid = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { focusStartedAt: 'not-a-date' }
		});
		expect(invalid.status).toBe(400);
		expect(invalid.body).toEqual({ error: 'Invalid focusStartedAt' });
		expect((await stored())?.toISOString()).toBe(startedAt.toISOString());

		const cleared = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { focusStartedAt: null }
		});
		expect(cleared.body).toEqual({
			success: true,
			task: expect.objectContaining({ focusStartedAt: null })
		});
		expect(await stored()).toBeNull();

		const restarted = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { focusStartedAt: '2026-02-02T10:00:00.000Z' }
		});
		expect(restarted.body).toEqual({
			success: true,
			task: expect.objectContaining({ focusStartedAt: '2026-02-02T10:00:00.000Z' })
		});
	});

	it('treats category as unchanged when absent, cleared on null/blank and set otherwise', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		await db.insert(taskCategories).values({ userId: mia.id, name: 'Work' });
		const task = await seedTask(db, { title: 'Categorised', category: 'Work', userId: mia.id });

		const absent = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { title: 'A' }
		});
		expect(absent.body).toEqual({
			success: true,
			task: expect.objectContaining({ category: 'Work' })
		});

		for (const category of [null, '   ']) {
			const cleared = await invoke(putTask, {
				ctx: ctx(),
				user: mia,
				path: `/api/tasks/${task.id}`,
				method: 'PUT',
				body: { category }
			});
			expect(cleared.body).toEqual({
				success: true,
				task: expect.objectContaining({ category: null })
			});
		}

		// A case variant of a listed name is stored in the list's spelling.
		const set = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { category: 'work' }
		});
		expect(set.body).toEqual({ success: true, task: expect.objectContaining({ category: 'Work' }) });

		const autoAdded = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { category: 'Home' }
		});
		expect(autoAdded.body).toEqual({
			success: true,
			task: expect.objectContaining({ category: 'Home' })
		});
		const names = (await db.select().from(taskCategories)).map((row) => row.name).sort();
		expect(names).toEqual(['Home', 'Work']);

		for (const [category, error] of [
			[7, 'category must be a string'],
			['x'.repeat(81), 'category is too long']
		] as const) {
			const refused = await invoke(putTask, {
				ctx: ctx(),
				user: mia,
				path: `/api/tasks/${task.id}`,
				method: 'PUT',
				body: { category }
			});
			expect(refused.status).toBe(400);
			expect(refused.body).toEqual({ error });
		}
	});
});

describe('PUT /api/tasks/[id] — completion, cursor and undo', () => {
	beforeEach(truncateAll);

	it('completes a one-off exactly once and keeps the history row on uncheck', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, {
			title: 'Mine',
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			userId: mia.id
		});

		const completed = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { toggleComplete: true }
		});
		expect(completed.status).toBe(200);
		// A toggle answer is the bare row: no `tags` key.
		expect(completed.body).toEqual({
			success: true,
			task: {
				id: task.id,
				title: 'Mine',
				notes: null,
				dueDate: null,
				completedAt: expect.stringMatching(PG_TIMESTAMP),
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
				eventId: null,
				focusMinutes: null,
				focusStartedAt: null,
				category: null,
				createdAt: expect.stringMatching(ISO)
			}
		});
		const history = await db.select().from(taskCompletions);
		expect(history).toEqual([
			expect.objectContaining({ taskId: task.id, userId: mia.id, actorId: mia.id })
		]);

		const unchecked = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { toggleComplete: true }
		});
		expect(unchecked.body).toEqual({
			success: true,
			task: expect.objectContaining({ completedAt: null })
		});
		// Completion history is append-only: unchecking never deletes the row.
		expect(await db.select().from(taskCompletions)).toHaveLength(1);
	});

	it('advances a recurring cursor from today by the smallest interval strictly past the due', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const stale = await seedTask(db, {
			title: 'Daily',
			dueDate: '2026-01-01T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			userId: mia.id
		});

		const first = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${stale.id}`,
			method: 'PUT',
			body: { toggleComplete: true }
		});
		expect(first.status).toBe(200);
		const [afterFirst] = await db.select().from(tasks).where(eq(tasks.id, stale.id));
		expect(DateTime.fromJSDate(new Date(afterFirst.dueDate ?? '')).toUTC().toISODate()).toBe(
			utcToday().plus({ days: 1 }).toISODate()
		);
		expect(afterFirst.completionCount).toBe(1);
		expect(afterFirst.completedAt).toBeNull();
		const history = await db.select().from(taskCompletions);
		expect(history).toEqual([
			expect.objectContaining({ taskId: stale.id, userId: mia.id, actorId: mia.id })
		]);

		// Due exactly one interval out pushes the next check two intervals out.
		const utcTomorrow = utcToday().plus({ days: 1 });
		const dueTomorrow = await seedTask(db, {
			title: 'Due tomorrow',
			dueDate: utcTomorrow.toISO() ?? undefined,
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			userId: mia.id
		});
		await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${dueTomorrow.id}`,
			method: 'PUT',
			body: { toggleComplete: true }
		});
		const [afterTomorrow] = await db.select().from(tasks).where(eq(tasks.id, dueTomorrow.id));
		expect(DateTime.fromJSDate(new Date(afterTomorrow.dueDate ?? '')).toUTC().toISODate()).toBe(
			utcTomorrow.plus({ days: 1 }).toISODate()
		);
	});

	it('skips without counting or recording history, and reopens a completed row', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, {
			title: 'Skip me',
			dueDate: '2026-01-01T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			completionCount: 2,
			completedAt: '2026-01-02T00:00:00.000Z',
			userId: mia.id
		});
		await db.insert(taskCompletions).values({ taskId: task.id, userId: mia.id, actorId: mia.id });

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { advanceToNext: true }
		});

		expect(res.status).toBe(200);
		const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id));
		expect(DateTime.fromJSDate(new Date(row.dueDate ?? '')).toUTC().toISODate()).toBe(
			utcToday().plus({ days: 1 }).toISODate()
		);
		expect(row.completionCount).toBe(2);
		expect(await db.select().from(taskCompletions)).toHaveLength(1);
		// TODAY's wire (probably accidental): skip also clears completedAt.
		expect(row.completedAt).toBeNull();

		const nonRecurring = await seedTask(db, { title: 'Plain', userId: mia.id });
		const refused = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${nonRecurring.id}`,
			method: 'PUT',
			body: { advanceToNext: true }
		});
		expect(refused.status).toBe(404);
		expect(refused.body).toEqual({ error: 'Task not found' });
	});

	it('undo restores the previous cursor, decrements the count and deletes the latest row', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, {
			title: 'Undo me',
			dueDate: '2026-01-01T00:00:00.000Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			completionCount: 1,
			userId: mia.id
		});
		await db.insert(taskCompletions).values({ taskId: task.id, userId: mia.id, actorId: mia.id });

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { undoComplete: true, previousDueDate: '2025-12-25T00:00:00.000Z' }
		});

		expect(res.status).toBe(200);
		const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id));
		expect(DateTime.fromJSDate(new Date(row.dueDate ?? '')).toUTC().toISODate()).toBe('2025-12-25');
		expect(row.completionCount).toBe(0);
		expect(await db.select().from(taskCompletions)).toEqual([]);

		// A second undo has nothing to reverse; the count guard answers 404.
		const again = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { undoComplete: true }
		});
		expect(again.status).toBe(404);
		expect(again.body).toEqual({ error: 'Nothing to undo' });
	});

	it('answers 404 Nothing to undo for every failed undo, a missing id included', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const plain = await seedTask(db, { title: 'Not recurring', userId: mia.id });

		for (const id of ['no-such-task', plain.id]) {
			const res = await invoke(putTask, {
				ctx: ctx(),
				user: mia,
				path: `/api/tasks/${id}`,
				method: 'PUT',
				body: { undoComplete: true }
			});
			expect(res.status).toBe(404);
			expect(res.body).toEqual({ error: 'Nothing to undo' });
		}
	});
});

describe('PUT /api/tasks/[id] — visibility, assignment and collaboration', () => {
	beforeEach(truncateAll);

	it('keeps visibility owner-only and validates the enum before any lookup', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		const task = await seedTask(db, {
			title: 'Family task',
			visibility: 'public',
			familyId: family.id,
			userId: sam.id
		});

		const refused = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { visibility: 'private' }
		});
		expect(refused.status).toBe(403);
		expect(refused.body).toEqual({ error: 'Only the task owner can change visibility' });

		const invalid = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { visibility: 'secret', title: 'Nope' }
		});
		expect(invalid.status).toBe(400);
		expect(invalid.body).toEqual({ error: 'Invalid visibility' });

		const unknown = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks/no-such-task',
			method: 'PUT',
			body: { visibility: 'private' }
		});
		expect(unknown.status).toBe(404);
		expect(unknown.body).toEqual({ error: 'Task not found' });

		const owner = await invoke(putTask, {
			ctx: ctx(),
			user: sam,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { visibility: 'private' }
		});
		expect(owner.body).toEqual({
			success: true,
			task: expect.objectContaining({ visibility: 'private' })
		});
	});

	it('reassigns to a family member as pending and alerts the new assignee', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		const task = await seedTask(db, {
			title: 'Plan trip',
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			familyId: family.id,
			userId: mia.id
		});

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { assignedTo: sam.id }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			task: expect.objectContaining({ assignedTo: sam.id, assignmentStatus: 'pending' })
		});
		expect(await db.select().from(notifications)).toEqual([
			expect.objectContaining({
				userId: sam.id,
				type: 'assignment_pending',
				message: "Mia assigned you 'Plan trip'"
			})
		]);
	});

	it('treats a re-sent unchanged assignee as a no-op (no reset, no alert)', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		const task = await seedTask(db, {
			title: 'Already accepted',
			assignedTo: sam.id,
			assignmentStatus: 'accepted',
			familyId: family.id,
			userId: mia.id
		});

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { assignedTo: sam.id, title: 'Edited' }
		});

		expect(res.body).toEqual({
			success: true,
			task: expect.objectContaining({
				title: 'Edited',
				assignedTo: sam.id,
				assignmentStatus: 'accepted'
			})
		});
		expect(await db.select().from(notifications)).toEqual([]);
	});

	it('lets the current assignee accept a pending assignment and alerts the owner', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const task = await seedTask(db, {
			title: 'Please do',
			assignedTo: mia.id,
			assignmentStatus: 'pending',
			userId: sam.id
		});

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { assignmentStatus: 'accepted' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			task: expect.objectContaining({ assignedTo: mia.id, assignmentStatus: 'accepted' })
		});
		expect(await db.select().from(notifications)).toEqual([
			expect.objectContaining({
				userId: sam.id,
				type: 'assignment_accepted',
				message: "Mia accepted 'Please do'"
			})
		]);
	});

	it('lets the current assignee decline: assignee cleared, status none, owner alerted', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const task = await seedTask(db, {
			title: 'Not mine',
			assignedTo: mia.id,
			assignmentStatus: 'pending',
			userId: sam.id
		});

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { assignmentStatus: 'declined' }
		});

		expect(res.status).toBe(200);
		// TODAY's wire: 'declined' is never stored; the row is released instead.
		expect(res.body).toEqual({
			success: true,
			task: expect.objectContaining({ assignedTo: null, assignmentStatus: 'none' })
		});
		const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id));
		expect([row.assignedTo, row.assignmentStatus]).toEqual([null, 'none']);
		expect(await db.select().from(notifications)).toEqual([
			expect.objectContaining({
				userId: sam.id,
				type: 'assignment_declined',
				message: "Mia declined 'Not mine'"
			})
		]);
	});

	it('alerts the owner once when someone else completes their task, never on un-check or self', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		const task = await seedTask(db, {
			title: 'Shared chore',
			familyId: family.id,
			userId: sam.id
		});

		const done = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { toggleComplete: true }
		});
		expect(done.status).toBe(200);
		expect(await db.select().from(notifications)).toEqual([
			expect.objectContaining({
				userId: sam.id,
				type: 'task_completed',
				actorName: 'Mia',
				message: "Mia completed 'Shared chore'",
				link: '/calendar/tasks',
				readAt: null
			})
		]);

		// Only the open -> done transition notifies: the un-check is silent.
		await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { toggleComplete: true }
		});
		expect(await db.select().from(notifications)).toHaveLength(1);

		// Checking off your OWN task never notifies yourself.
		const own = await seedTask(db, { title: 'Mine', userId: mia.id });
		await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${own.id}`,
			method: 'PUT',
			body: { toggleComplete: true }
		});
		expect(await db.select().from(notifications)).toHaveLength(1);
	});

	it('answers 400 when the new assignee is not a member of the task`s family', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		const task = await seedTask(db, {
			title: 'Family chore',
			familyId: family.id,
			userId: mia.id
		});

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { assignedTo: sam.id }
		});

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Assignee is not a member of this family' });
	});

	it('answers 403 when a non-assignee collaborator tries to reassign', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const lee = await seedUser(db, { firstName: 'Lee' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		await addMember(db, lee.id, family.id);
		const task = await seedTask(db, {
			title: 'Family task',
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			familyId: family.id,
			userId: sam.id
		});

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: lee,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { assignedTo: lee.id }
		});

		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'You can only respond to your own assignments' });
	});

	it('lets a family member edit plain fields and tags, and answers 404 without rights', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		const familyTask = await seedTask(db, {
			title: 'Shared',
			familyId: family.id,
			userId: sam.id
		});
		const personalTask = await seedTask(db, { title: 'Sam only', userId: sam.id });

		const edited = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${familyTask.id}`,
			method: 'PUT',
			body: { title: 'From Mia', tags: ['Shared'] }
		});
		expect(edited.status).toBe(200);
		expect(edited.body).toEqual({
			success: true,
			task: expect.objectContaining({ title: 'From Mia', tags: ['shared'] })
		});

		const refused = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${personalTask.id}`,
			method: 'PUT',
			body: { title: 'Hijack' }
		});
		expect(refused.status).toBe(404);
		expect(refused.body).toEqual({ error: 'Task not found' });

		const unknown = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks/no-such-task',
			method: 'PUT',
			body: { title: 'Ghost' }
		});
		expect(unknown.status).toBe(404);
		expect(unknown.body).toEqual({ error: 'Task not found' });
	});
});

describe('PUT /api/tasks/[id] — recurrence and the accidental wire', () => {
	beforeEach(truncateAll);

	it('validates recurrence and clears both fields with a null frequency', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, {
			title: 'Weekly',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			userId: mia.id
		});

		for (const [body, error] of [
			[{ recurrenceFrequency: 'hourly' }, 'Invalid recurrenceFrequency'],
			[{ recurrenceInterval: '2' }, 'Invalid recurrenceInterval']
		] as const) {
			const refused = await invoke(putTask, {
				ctx: ctx(),
				user: mia,
				path: `/api/tasks/${task.id}`,
				method: 'PUT',
				body
			});
			expect(refused.status).toBe(400);
			expect(refused.body).toEqual({ error });
		}

		const intervalOnly = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { recurrenceInterval: 2 }
		});
		expect(intervalOnly.body).toEqual({
			success: true,
			task: expect.objectContaining({ recurrenceFrequency: 'weekly', recurrenceInterval: 2 })
		});

		const cleared = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { recurrenceFrequency: null }
		});
		expect(cleared.body).toEqual({
			success: true,
			task: expect.objectContaining({ recurrenceFrequency: null, recurrenceInterval: null })
		});

		const newFrequency = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { recurrenceFrequency: 'daily' }
		});
		expect(newFrequency.body).toEqual({
			success: true,
			task: expect.objectContaining({ recurrenceFrequency: 'daily', recurrenceInterval: 1 })
		});

		// An interval sent alone on a non-recurring task is ignored.
		const plain = await seedTask(db, { title: 'Plain', userId: mia.id });
		const ignored = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${plain.id}`,
			method: 'PUT',
			body: { recurrenceInterval: 3 }
		});
		expect(ignored.body).toEqual({
			success: true,
			task: expect.objectContaining({ recurrenceFrequency: null, recurrenceInterval: null })
		});
	});

	it('writes a raw completedAt directly, bypassing the cursor and history', async () => {
		// Probably accidental: the spec tells clients not to send completedAt.
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Direct', userId: mia.id });

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { completedAt: '2026-05-05T10:00:00.000Z' }
		});

		expect(res.status).toBe(200);
		const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id));
		expect(new Date(row.completedAt ?? '').toISOString()).toBe('2026-05-05T10:00:00.000Z');
		expect(await db.select().from(taskCompletions)).toEqual([]);
		expect(row.completionCount).toBe(0);
	});

	it('silently ignores a whitespace-only title instead of rejecting it', async () => {
		// Probably accidental: every other invalid input is a 400.
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Keep me', userId: mia.id });

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { title: '   ' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, task: expect.objectContaining({ title: 'Keep me' }) });
	});

	it('does not validate dueDate: garbage reaches the UPDATE and answers 500', async () => {
		// Probably accidental: POST /api/tasks answers 400 Invalid dueDate for
		// the same input. Pinned as today's wire; S3 should reject it.
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Dated', userId: mia.id });

		const res = await invoke(putTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${task.id}`,
			method: 'PUT',
			body: { dueDate: 'not-a-date' }
		});

		expect(res.status).toBe(500);
		expect(res.body).toEqual({ error: 'Failed to update task' });
	});
});

describe('DELETE /api/tasks/[id]', () => {
	beforeEach(truncateAll);

	it('hard-deletes an open task and archives a completed one', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const open = await seedTask(db, { title: 'Open', userId: mia.id });
		const completed = await seedTask(db, {
			title: 'Done',
			completedAt: '2026-01-01T00:00:00.000Z',
			userId: mia.id
		});

		const deleted = await invoke(deleteTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${open.id}`,
			method: 'DELETE'
		});
		expect(deleted.status).toBe(200);
		expect(deleted.body).toEqual({ success: true });
		expect(await db.select().from(tasks).where(eq(tasks.id, open.id))).toEqual([]);

		const archived = await invoke(deleteTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${completed.id}`,
			method: 'DELETE'
		});
		expect(archived.status).toBe(200);
		const [row] = await db.select().from(tasks).where(eq(tasks.id, completed.id));
		expect(row.archivedAt).not.toBeNull();
		expect(row.completedAt).not.toBeNull();
	});

	it('lets a family member delete a family task but answers 404 for another user`s personal task', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		await addMember(db, sam.id, family.id);
		const familyTask = await seedTask(db, {
			title: 'Shared',
			familyId: family.id,
			userId: sam.id
		});
		const personal = await seedTask(db, { title: 'Private', userId: sam.id });

		const shared = await invoke(deleteTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${familyTask.id}`,
			method: 'DELETE'
		});
		expect(shared.status).toBe(200);
		expect(shared.body).toEqual({ success: true });

		const refused = await invoke(deleteTask, {
			ctx: ctx(),
			user: mia,
			path: `/api/tasks/${personal.id}`,
			method: 'DELETE'
		});
		expect(refused.status).toBe(404);
		expect(refused.body).toEqual({ error: 'Task not found' });
		expect(await db.select().from(tasks).where(eq(tasks.id, personal.id))).toHaveLength(1);

		const unknown = await invoke(deleteTask, {
			ctx: ctx(),
			user: mia,
			path: '/api/tasks/no-such-task',
			method: 'DELETE'
		});
		expect(unknown.status).toBe(404);
		expect(unknown.body).toEqual({ error: 'Task not found' });
	});
});

describe('signed out', () => {
	beforeEach(truncateAll);

	it('answers 401 {"error":"Unauthorized"} on PUT and DELETE', async () => {
		const calls = [
			() =>
				invoke(putTask, {
					ctx: ctx(),
					path: '/api/tasks/x',
					method: 'PUT',
					body: { title: 'X' }
				}),
			() => invoke(deleteTask, { ctx: ctx(), path: '/api/tasks/x', method: 'DELETE' })
		];
		for (const call of calls) {
			const res = await call();
			expect(res.status).toBe(401);
			expect(res.body).toEqual({ error: 'Unauthorized' });
		}
	});
});
