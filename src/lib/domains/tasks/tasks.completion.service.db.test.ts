/**
 * tasks completion services against real Postgres: check-off (one-off and the
 * Recurring Task cursor), skip, undo, the two completion Alerts, and the
 * double-click race over two real connections.
 *
 * Expected values come from legacy `db/actions/tasks/cursor.ts` and
 * `mutations.ts` (the four cursor worked examples, the undo rewind, the
 * count-based recurring transition) and the frozen goldens
 * (`tasks.update.http.db.test.ts`). Every test runs in `rollbackTest` except
 * the race, which needs the committed database so two connections can contend.
 *
 * Doc: ./README.md#how-to-test
 */
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { notifications, taskCompletions } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest, testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import {
	skipTaskOccurrence,
	toggleTaskCompletion,
	undoTaskCompletion
} from './tasks.completion.service.server';
import {
	addMember,
	seedTask,
	seedTaskCompletion,
	seedTaskFamily,
	seedUserZone
} from './tasks.fixtures.server';

const NOW = '2026-03-01T09:00:00.000Z';

/** A family with Mia (creator) and Sam (member). */
async function seedHousehold(db: Db) {
	const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Lee' });
	const sam = await seedUser(db, { firstName: 'Sam', lastName: 'Diaz' });
	const home = await seedTaskFamily(db, 'Home');
	await addMember(db, mia.id, home.id, 'creator');
	await addMember(db, sam.id, home.id, 'member');
	return { mia, sam, home };
}

/** Every history row of one Task, oldest first. */
async function historyOf(db: Db, taskId: string) {
	return db
		.select()
		.from(taskCompletions)
		.where(eq(taskCompletions.taskId, taskId));
}

describe('toggleTaskCompletion', () => {
	rollbackTest('completes a one-off once, keeps the history row on un-check, and refuses an undo', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedTask(db, { title: 'Buy milk', userId: mia.id });
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		const done = await toggleTaskCompletion(ctx, actor, { taskId: task.id });
		expect(done).toMatchObject({ completedAt: '2026-03-01 09:00:00+00' });
		const history = await historyOf(db, task.id);
		expect(history).toHaveLength(1);
		expect(history[0]).toMatchObject({ userId: mia.id, actorId: mia.id });

		const undone = await toggleTaskCompletion(ctx, actor, { taskId: task.id });
		expect(undone).toMatchObject({ completedAt: null });
		expect(await historyOf(db, task.id)).toHaveLength(1);

		await expect(
			undoTaskCompletion(ctx, actor, { taskId: task.id, previousDueDate: null })
		).rejects.toMatchObject({ status: 404, message: 'Nothing to undo' });
	});

	rollbackTest('advances a recurring cursor from today by the smallest interval strictly past the due', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedTask(db, {
			title: 'Water plants',
			userId: mia.id,
			dueDate: '2026-02-27 00:00:00+00',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1
		});
		const ctx = testCtx({ db, now: NOW });

		const advanced = await toggleTaskCompletion(ctx, actorFromUser(mia, 'session'), {
			taskId: task.id
		});

		expect(advanced).toMatchObject({
			dueDate: '2026-03-02 00:00:00+00',
			completionCount: 1,
			completedAt: null
		});
		const history = await historyOf(db, task.id);
		expect(history).toHaveLength(1);
		expect(history[0].actorId).toBe(mia.id);
	});

	rollbackTest('takes two intervals when the due sits exactly one interval out', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedTask(db, {
			title: 'Water plants',
			userId: mia.id,
			dueDate: '2026-03-02 00:00:00+00',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1
		});
		const ctx = testCtx({ db, now: NOW });

		const advanced = await toggleTaskCompletion(ctx, actorFromUser(mia, 'session'), {
			taskId: task.id
		});

		expect(advanced.dueDate).toBe('2026-03-03 00:00:00+00');
	});

	rollbackTest('anchors the cursor on the caller`s stored zone, not the server day', async (db) => {
		const { mia } = await seedHousehold(db);
		await seedUserZone(db, mia.id, 'Pacific/Kiritimati');
		const task = await seedTask(db, {
			title: 'Water plants',
			userId: mia.id,
			dueDate: '2026-02-27 10:00:00+00',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1
		});
		const ctx = testCtx({ db, now: NOW });

		const advanced = await toggleTaskCompletion(ctx, actorFromUser(mia, 'session'), {
			taskId: task.id
		});

		// 2026-03-01T00:00+14:00 is 2026-02-28T10:00:00Z — the owner's day start.
		expect(advanced.dueDate).toBe('2026-02-28 10:00:00+00');
	});

	rollbackTest('alerts the owner on someone else`s check-off, never on self or an un-check', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		const task = await seedTask(db, { title: 'Bins', userId: mia.id, familyId: home.id });
		const ctx = testCtx({ db, now: NOW });

		await toggleTaskCompletion(ctx, actorFromUser(sam, 'session'), { taskId: task.id });
		const alerts = await db
			.select()
			.from(notifications)
			.where(eq(notifications.userId, mia.id));
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toMatchObject({
			type: 'task_completed',
			actorName: 'Sam',
			message: "Sam completed 'Bins'",
			link: '/calendar/tasks'
		});

		// Un-checking is not a completion: no second Alert.
		await toggleTaskCompletion(ctx, actorFromUser(sam, 'session'), { taskId: task.id });
		expect(
			await db.select().from(notifications).where(eq(notifications.userId, mia.id))
		).toHaveLength(1);

		// The owner's own check-off never notifies anybody.
		await toggleTaskCompletion(ctx, actorFromUser(mia, 'session'), { taskId: task.id });
		expect(
			await db.select().from(notifications).where(eq(notifications.userId, mia.id))
		).toHaveLength(1);
	});

	rollbackTest('alerts the owner when a non-owner advances a recurring task (count-based)', async (db) => {
		const { mia, sam, home } = await seedHousehold(db);
		const task = await seedTask(db, {
			title: 'Water plants',
			userId: mia.id,
			familyId: home.id,
			dueDate: '2026-02-27 00:00:00+00',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1
		});
		const ctx = testCtx({ db, now: NOW });

		await toggleTaskCompletion(ctx, actorFromUser(sam, 'session'), { taskId: task.id });

		const alerts = await db
			.select()
			.from(notifications)
			.where(eq(notifications.userId, mia.id));
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toMatchObject({ type: 'task_completed', actorName: 'Sam' });
	});

	rollbackTest('answers 404 Task not found without mutation rights', async (db) => {
		const { mia } = await seedHousehold(db);
		const stranger = await seedUser(db, { firstName: 'Ada' });
		const task = await seedTask(db, { title: 'Mine', userId: mia.id });
		const ctx = testCtx({ db, now: NOW });

		await expect(
			toggleTaskCompletion(ctx, actorFromUser(stranger, 'session'), { taskId: task.id })
		).rejects.toMatchObject({ status: 404, message: 'Task not found' });
	});
});

describe('skipTaskOccurrence', () => {
	rollbackTest('moves the cursor with no history row and no count change, reopening the row', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedTask(db, {
			title: 'Water plants',
			userId: mia.id,
			dueDate: '2026-02-27 00:00:00+00',
			completedAt: '2026-02-01 00:00:00+00',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1
		});
		const ctx = testCtx({ db, now: NOW });

		const skipped = await skipTaskOccurrence(ctx, actorFromUser(mia, 'session'), {
			taskId: task.id
		});

		expect(skipped).toMatchObject({
			dueDate: '2026-03-02 00:00:00+00',
			completedAt: null,
			completionCount: 0
		});
		expect(await historyOf(db, task.id)).toEqual([]);
	});

	rollbackTest('answers 404 Task not found for a non-recurring task', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedTask(db, { title: 'One-off', userId: mia.id });
		const ctx = testCtx({ db, now: NOW });

		await expect(
			skipTaskOccurrence(ctx, actorFromUser(mia, 'session'), { taskId: task.id })
		).rejects.toMatchObject({ status: 404, message: 'Task not found' });
	});
});

describe('undoTaskCompletion', () => {
	/** A recurring task with one counted check-off and its latest history row. */
	async function seedUndoable(db: Db, userId: string) {
		const task = await seedTask(db, {
			title: 'Water plants',
			userId,
			dueDate: '2026-03-10 00:00:00+00',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			completionCount: 2
		});
		await seedTaskCompletion(db, {
			taskId: task.id,
			userId,
			actorId: userId,
			completedAt: '2026-03-05 00:00:00+00'
		});
		return task;
	}

	rollbackTest('accepts a hint strictly before the current due and deletes the latest history row', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedUndoable(db, mia.id);
		const ctx = testCtx({ db, now: NOW });

		const undone = await undoTaskCompletion(ctx, actorFromUser(mia, 'session'), {
			taskId: task.id,
			previousDueDate: '2026-03-08T00:00:00.000Z'
		});

		expect(undone).toMatchObject({
			dueDate: '2026-03-08 00:00:00+00',
			completionCount: 1
		});
		expect(await historyOf(db, task.id)).toEqual([]);
	});

	rollbackTest('derives the previous cursor when the client sends no hint', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedUndoable(db, mia.id);
		const ctx = testCtx({ db, now: NOW });

		const undone = await undoTaskCompletion(ctx, actorFromUser(mia, 'session'), {
			taskId: task.id,
			previousDueDate: null
		});

		expect(undone.dueDate).toBe('2026-03-09 00:00:00+00');
	});

	rollbackTest('ignores a hint that is not strictly before the current due', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedUndoable(db, mia.id);
		const ctx = testCtx({ db, now: NOW });

		const undone = await undoTaskCompletion(ctx, actorFromUser(mia, 'session'), {
			taskId: task.id,
			previousDueDate: '2026-03-12T00:00:00.000Z'
		});

		expect(undone.dueDate).toBe('2026-03-09 00:00:00+00');
	});

	rollbackTest('a second undo matches no counted completion and answers Nothing to undo', async (db) => {
		const { mia } = await seedHousehold(db);
		const task = await seedTask(db, {
			title: 'Water plants',
			userId: mia.id,
			dueDate: '2026-03-10 00:00:00+00',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			completionCount: 1
		});
		await seedTaskCompletion(db, {
			taskId: task.id,
			userId: mia.id,
			actorId: mia.id,
			completedAt: '2026-03-05 00:00:00+00'
		});
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		await undoTaskCompletion(ctx, actor, { taskId: task.id, previousDueDate: null });
		await expect(
			undoTaskCompletion(ctx, actor, { taskId: task.id, previousDueDate: null })
		).rejects.toMatchObject({ status: 404, message: 'Nothing to undo' });
	});
});

describe('concurrent check-offs', () => {
	beforeEach(truncateAll);

	it('two toggles over two connections append exactly one history row', async () => {
		// Committed mode: the pool's second connection is what makes the guard real.
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Buy milk', userId: mia.id });
		const ctxA = testCtx({ db, now: NOW });
		const ctxB = testCtx({ db, now: NOW });

		const [first, second] = await Promise.all([
			toggleTaskCompletion(ctxA, actorFromUser(mia, 'session'), { taskId: task.id }),
			toggleTaskCompletion(ctxB, actorFromUser(mia, 'session'), { taskId: task.id })
		]);

		expect(first.id).toBe(task.id);
		expect(second.id).toBe(task.id);
		// History is append-only and only the guarded open -> done write inserts:
		// a losing second click inserts nothing, whatever it then observes.
		const rows = await db
			.select()
			.from(taskCompletions)
			.where(and(eq(taskCompletions.taskId, task.id)));
		expect(rows).toHaveLength(1);
	});
});
