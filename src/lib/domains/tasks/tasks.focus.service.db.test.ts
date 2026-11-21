/**
 * tasks focus services against real Postgres: one test per IO Invariant,
 * titled after the rule. Each runs in `rollbackTest` and `testCtx({ db })`
 * supplies the clock and the ids, so no test reads the process clock.
 *
 * Expected values come from the legacy code
 * (`src/lib/server/db/actions/taskfocusSessions.ts`,
 * `src/routes/api/taskfocus/**`) and the frozen golden
 * `tasks.focus.http.db.test.ts`.
 *
 * Doc: ./README.md#how-to-test
 */
import { and, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { taskfocusCommands, taskfocusSessions } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import {
	ackFocusCommand,
	absorbFocusSession,
	discardFocusSession,
	endFocusSession,
	getPhoneFocusOverlay,
	issueFocusCommand,
	listFocusCommands,
	listUnabsorbedFocusSessions,
	startFocusSession
} from './tasks.focus.service.server';
import {
	addMember,
	seedTask,
	seedTaskFamily,
	seedTaskFocusCommands,
	seedTaskFocusSession
} from './tasks.fixtures.server';

const NOW = '2026-03-01T12:00:00.000Z';
const at = (iso: string) => new Date(iso);
/** A caller plus their own (open) Task, the shape every session test starts from. */
async function callerWithTask(db: Db) {
	const mia = await seedUser(db, { firstName: 'Mia' });
	const task = await seedTask(db, { title: 'Essay', userId: mia.id });
	return { mia, task, actor: actorFromUser(mia, 'session') };
}

describe('device commands', () => {
	rollbackTest(
		'lists the queue oldest first, drops rows older than 10 minutes and caps one read at 25',
		async (db) => {
			const { mia, actor } = await callerWithTask(db);
			const fresh = Array.from({ length: 26 }, (_, index) => ({
				userId: mia.id,
				command: 'stop',
				taskId: null,
				// 26 rows inside the window, newest last.
				issuedAt: at('2026-03-01T11:50:00.000Z').valueOf() + index * 1000
			}));
			await seedTaskFocusCommands(
				db,
				fresh.map((row) => ({ ...row, issuedAt: new Date(row.issuedAt) }))
			);
			await seedTaskFocusCommands(db, [
				{ userId: mia.id, command: 'stop', taskId: null, issuedAt: at('2026-03-01T11:49:00.000Z') }
			]);

			const rows = await listFocusCommands(testCtx({ db, now: NOW }), actor);

			expect(rows).toHaveLength(25);
			expect(rows.map((row) => row.issuedAt.toISOString())).toEqual(
				fresh.slice(0, 25).map((row) => new Date(row.issuedAt).toISOString())
			);
			// The stale row is gone, not merely hidden from the answer; the 26 fresh
			// rows stay (the read cap is not a delete).
			const stored = await db
				.select({ issuedAt: taskfocusCommands.issuedAt })
				.from(taskfocusCommands)
				.where(eq(taskfocusCommands.userId, mia.id));
			expect(stored).toHaveLength(26);
		}
	);

	rollbackTest('enqueues start for the caller`s own task and stop without a task', async (db) => {
		const { mia, task, actor } = await callerWithTask(db);
		const testCtxValue = testCtx({ db, now: NOW });

		const start = await issueFocusCommand(testCtxValue, actor, { command: 'start', taskId: task.id });
		expect(start).toMatchObject({
			userId: mia.id,
			command: 'start',
			taskId: task.id,
			issuedAt: at(NOW)
		});

		const stop = await issueFocusCommand(testCtxValue, actor, { command: 'stop', taskId: null });
		expect(stop).toMatchObject({ command: 'stop', taskId: null });
		expect(await listFocusCommands(testCtxValue, actor)).toHaveLength(2);
	});

	rollbackTest('answers 400 Task not found when a start names a task the caller cannot edit', async (db) => {
		const { actor } = await callerWithTask(db);
		const sam = await seedUser(db);
		const theirs = await seedTask(db, { title: 'Theirs', userId: sam.id });
		const testCtxValue = testCtx({ db, now: NOW });

		await expect(
			issueFocusCommand(testCtxValue, actor, { command: 'start', taskId: theirs.id })
		).rejects.toMatchObject({ status: 400, message: 'Task not found' });
		await expect(
			issueFocusCommand(testCtxValue, actor, { command: 'start', taskId: 'no-such-task' })
		).rejects.toMatchObject({ status: 400, message: 'Task not found' });
		expect(await db.select().from(taskfocusCommands)).toEqual([]);
	});

	rollbackTest('ignores stop`s task id: a foreign one still enqueues and is not stored (Q-056)', async (db) => {
		const { actor } = await callerWithTask(db);
		const sam = await seedUser(db);
		const theirs = await seedTask(db, { title: 'Theirs', userId: sam.id });
		const testCtxValue = testCtx({ db, now: NOW });

		const stop = await issueFocusCommand(testCtxValue, actor, {
			command: 'stop',
			taskId: theirs.id
		});

		expect(stop).toMatchObject({ command: 'stop', taskId: null });
	});

	rollbackTest('starts focus on any task the caller can edit (Q-060)', async (db) => {
		const { mia, task, actor } = await callerWithTask(db);
		const sam = await seedUser(db, { firstName: 'Sam' });
		const home = await seedTaskFamily(db);
		await addMember(db, mia.id, home.id);
		await addMember(db, sam.id, home.id);
		const testCtxValue = testCtx({ db, now: NOW });
		const familyTask = await seedTask(db, {
			title: 'Family chore',
			userId: sam.id,
			familyId: home.id
		});
		const accepted = await seedTask(db, {
			title: 'Their personal, mine now',
			userId: sam.id,
			assignedTo: mia.id,
			assignmentStatus: 'accepted'
		});

		for (const scenario of [task, familyTask, accepted]) {
			const row = await issueFocusCommand(testCtxValue, actor, {
				command: 'start',
				taskId: scenario.id
			});
			expect(row).toMatchObject({ command: 'start', taskId: scenario.id });
		}
	});

	rollbackTest('acks an own, foreign or already-gone id without an error', async (db) => {
		const { mia, actor } = await callerWithTask(db);
		const sam = await seedUser(db);
		const testCtxValue = testCtx({ db, now: NOW });
		const mine = await issueFocusCommand(testCtxValue, actor, { command: 'stop', taskId: null });
		await seedTaskFocusCommands(db, [
			{ userId: sam.id, command: 'stop', taskId: null, issuedAt: at(NOW) }
		]);
		const foreign = await db
			.select()
			.from(taskfocusCommands)
			.where(eq(taskfocusCommands.userId, sam.id));

		await ackFocusCommand(testCtxValue, actor, foreign[0]!.id);
		expect(
			await db
				.select()
				.from(taskfocusCommands)
				.where(and(eq(taskfocusCommands.userId, sam.id), eq(taskfocusCommands.id, foreign[0]!.id)))
		).toHaveLength(1);

		await ackFocusCommand(testCtxValue, actor, mine.id);
		await ackFocusCommand(testCtxValue, actor, mine.id);
		const left = await db
			.select()
			.from(taskfocusCommands)
			.where(eq(taskfocusCommands.userId, mia.id));
		expect(left).toEqual([]);
	});
});

describe('phone focus sessions', () => {
	rollbackTest('starts an open session and answers its whole row', async (db) => {
		const { mia, task, actor } = await callerWithTask(db);

		const session = await startFocusSession(testCtx({ db, now: NOW }), actor, {
			taskId: task.id,
			startedAt: at('2026-03-01T11:55:00.000Z'),
			endedAt: null
		});

		expect(session).toMatchObject({
			userId: mia.id,
			taskId: task.id,
			startedAt: at('2026-03-01T11:55:00.000Z'),
			endedAt: null,
			source: 'phone',
			absorbedAt: null
		});
	});

	rollbackTest('refuses a second open start with 409 and the running session`s id', async (db) => {
		const { task, actor } = await callerWithTask(db);
		const testCtxValue = testCtx({ db, now: NOW });
		const open = await startFocusSession(testCtxValue, actor, {
			taskId: task.id,
			startedAt: at('2026-03-01T11:00:00.000Z'),
			endedAt: null
		});

		await expect(
			startFocusSession(testCtxValue, actor, {
				taskId: task.id,
				startedAt: at('2026-03-01T11:30:00.000Z'),
				endedAt: null
			})
		).rejects.toMatchObject({
			status: 409,
			message: 'A phone focus session is already running',
			extra: { openSessionId: open.id }
		});
		expect(await db.select().from(taskfocusSessions)).toHaveLength(1);
	});

	rollbackTest('never refuses a finished session for an open one', async (db) => {
		const { task, actor } = await callerWithTask(db);
		const testCtxValue = testCtx({ db, now: NOW });
		await startFocusSession(testCtxValue, actor, {
			taskId: task.id,
			startedAt: at('2026-03-01T11:00:00.000Z'),
			endedAt: null
		});

		const offline = await startFocusSession(testCtxValue, actor, {
			taskId: task.id,
			startedAt: at('2026-03-01T09:00:00.000Z'),
			endedAt: at('2026-03-01T09:30:00.000Z')
		});

		expect(offline.endedAt).toEqual(at('2026-03-01T09:30:00.000Z'));
		expect(await db.select().from(taskfocusSessions)).toHaveLength(2);
	});

	rollbackTest('bounds the times: start at most 5 minutes ahead, end after start, at most 12 hours', async (db) => {
		const { task, actor } = await callerWithTask(db);
		const testCtxValue = testCtx({ db, now: NOW });

		// Exactly 5 minutes ahead is allowed (both bounds are inclusive).
		await startFocusSession(testCtxValue, actor, {
			taskId: task.id,
			startedAt: at('2026-03-01T12:05:00.000Z'),
			endedAt: null
		});
		await expect(
			startFocusSession(testCtxValue, actor, {
				taskId: task.id,
				startedAt: at('2026-03-01T12:05:00.001Z'),
				endedAt: null
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'startedAt is more than 5 minutes in the future'
		});
		await expect(
			startFocusSession(testCtxValue, actor, {
				taskId: task.id,
				startedAt: at('2026-03-01T10:00:00.000Z'),
				endedAt: at('2026-03-01T10:00:00.000Z')
			})
		).rejects.toMatchObject({ status: 400, message: 'endedAt must be after startedAt' });
		// Exactly 12 hours is allowed; one millisecond more is not.
		await startFocusSession(testCtxValue, actor, {
			taskId: task.id,
			startedAt: at('2026-02-28T20:00:00.000Z'),
			endedAt: at('2026-03-01T08:00:00.000Z')
		});
		await expect(
			startFocusSession(testCtxValue, actor, {
				taskId: task.id,
				startedAt: at('2026-02-28T20:00:00.000Z'),
				endedAt: at('2026-03-01T08:00:00.001Z')
			})
		).rejects.toMatchObject({ status: 400, message: 'Session is longer than 12 hours' });
	});

	rollbackTest('answers 404 for an archived task and for a task the caller cannot mutate', async (db) => {
		const { actor } = await callerWithTask(db);
		const sam = await seedUser(db);
		const archived = await seedTask(db, {
			title: 'Archived',
			userId: actor.id,
			archivedAt: '2026-02-01 00:00:00+00'
		});
		const personal = await seedTask(db, { title: 'Sam`s own', userId: sam.id });
		const testCtxValue = testCtx({ db, now: NOW });

		await expect(
			startFocusSession(testCtxValue, actor, {
				taskId: archived.id,
				startedAt: at('2026-03-01T11:00:00.000Z'),
				endedAt: null
			})
		).rejects.toMatchObject({ status: 404, message: 'Task not found' });
		await expect(
			startFocusSession(testCtxValue, actor, {
				taskId: personal.id,
				startedAt: at('2026-03-01T11:00:00.000Z'),
				endedAt: null
			})
		).rejects.toMatchObject({ status: 404, message: 'Task not found' });
		await expect(
			startFocusSession(testCtxValue, actor, {
				taskId: 'no-such-task',
				startedAt: at('2026-03-01T11:00:00.000Z'),
				endedAt: null
			})
		).rejects.toMatchObject({ status: 404, message: 'Task not found' });
		expect(await db.select().from(taskfocusSessions)).toEqual([]);
	});

	rollbackTest('lets a family member focus a family task', async (db) => {
		const { mia, actor } = await callerWithTask(db);
		const family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		const familyTask = await seedTask(db, { title: 'Chores', userId: mia.id, familyId: family.id });
		const sam = await seedUser(db);
		await addMember(db, sam.id, family.id);

		const session = await startFocusSession(testCtx({ db, now: NOW }), actorFromUser(sam, 'session'), {
			taskId: familyTask.id,
			startedAt: at('2026-03-01T11:00:00.000Z'),
			endedAt: null
		});
		expect(session.taskId).toBe(familyTask.id);
		expect(session.userId).toBe(sam.id);
	});

	rollbackTest('stops a session and lets a retried stop overwrite the end', async (db) => {
		const { task, actor } = await callerWithTask(db);
		const testCtxValue = testCtx({ db, now: NOW });
		const open = await startFocusSession(testCtxValue, actor, {
			taskId: task.id,
			startedAt: at('2026-03-01T11:00:00.000Z'),
			endedAt: null
		});

		const stopped = await endFocusSession(testCtxValue, actor, {
			id: open.id,
			endedAt: at('2026-03-01T11:20:00.000Z')
		});
		expect(stopped.endedAt).toEqual(at('2026-03-01T11:20:00.000Z'));

		const again = await endFocusSession(testCtxValue, actor, {
			id: open.id,
			endedAt: at('2026-03-01T11:25:00.000Z')
		});
		expect(again.endedAt).toEqual(at('2026-03-01T11:25:00.000Z'));
	});

	rollbackTest('refuses a stop of another user`s session (404) and of an absorbed one (409)', async (db) => {
		const { task, actor } = await callerWithTask(db);
		const sam = await seedUser(db);
		const testCtxValue = testCtx({ db, now: NOW });
		const foreign = await seedTaskFocusSession(db, {
			userId: sam.id,
			taskId: task.id,
			startedAt: at('2026-03-01T11:00:00.000Z'),
			endedAt: null
		});
		const absorbed = await seedTaskFocusSession(db, {
			userId: actor.id,
			taskId: task.id,
			startedAt: at('2026-03-01T11:00:00.000Z'),
			endedAt: at('2026-03-01T11:10:00.000Z'),
			absorbedAt: at('2026-03-01T11:11:00.000Z')
		});

		await expect(
			endFocusSession(testCtxValue, actor, {
				id: foreign.id,
				endedAt: at('2026-03-01T11:20:00.000Z')
			})
		).rejects.toMatchObject({ status: 404, message: 'Session not found' });
		await expect(
			endFocusSession(testCtxValue, actor, {
				id: absorbed.id,
				endedAt: at('2026-03-01T11:20:00.000Z')
			})
		).rejects.toMatchObject({ status: 409, message: 'Session already absorbed' });
		await expect(
			endFocusSession(testCtxValue, actor, {
				id: 'no-such-session',
				endedAt: at('2026-03-01T11:20:00.000Z')
			})
		).rejects.toMatchObject({ status: 404, message: 'Session not found' });
	});

	rollbackTest('discards an unabsorbed session and refuses an absorbed one', async (db) => {
		const { task, actor } = await callerWithTask(db);
		const testCtxValue = testCtx({ db, now: NOW });
		const open = await startFocusSession(testCtxValue, actor, {
			taskId: task.id,
			startedAt: at('2026-03-01T11:00:00.000Z'),
			endedAt: null
		});
		const absorbed = await seedTaskFocusSession(db, {
			userId: actor.id,
			taskId: task.id,
			startedAt: at('2026-03-01T09:00:00.000Z'),
			endedAt: at('2026-03-01T09:10:00.000Z'),
			absorbedAt: at('2026-03-01T09:11:00.000Z')
		});

		await discardFocusSession(testCtxValue, actor, open.id);
		expect(
			await db.select().from(taskfocusSessions).where(eq(taskfocusSessions.id, open.id))
		).toEqual([]);
		await expect(discardFocusSession(testCtxValue, actor, absorbed.id)).rejects.toMatchObject({
			status: 409,
			message: 'Session already absorbed'
		});
		await expect(discardFocusSession(testCtxValue, actor, 'no-such-session')).rejects.toMatchObject({
			status: 404,
			message: 'Session not found'
		});
	});

	rollbackTest('absorbs a closed session once and keeps the original stamp on a repeat', async (db) => {
		const { task, actor } = await callerWithTask(db);
		const ctxValue = testCtx({ db, now: NOW });
		const open = await startFocusSession(ctxValue, actor, {
			taskId: task.id,
			startedAt: at('2026-03-01T11:00:00.000Z'),
			endedAt: null
		});
		const closed = await endFocusSession(ctxValue, actor, {
			id: open.id,
			endedAt: at('2026-03-01T11:20:00.000Z')
		});

		// A still-running session cannot be absorbed.
		const running = await startFocusSession(ctxValue, actor, {
			taskId: task.id,
			startedAt: at('2026-03-01T11:30:00.000Z'),
			endedAt: null
		});
		await expect(absorbFocusSession(ctxValue, actor, running.id)).rejects.toMatchObject({
			status: 409,
			message: 'Only closed sessions can be absorbed'
		});

		const absorbed = await absorbFocusSession(ctxValue, actor, closed.id);
		expect(absorbed.absorbedAt).toEqual(at(NOW));

		ctxValue.clock.set('2026-03-01T13:00:00.000Z');
		const repeat = await absorbFocusSession(ctxValue, actor, closed.id);
		expect(repeat.absorbedAt).toEqual(at(NOW));
		await expect(absorbFocusSession(ctxValue, actor, 'no-such-session')).rejects.toMatchObject({
			status: 404,
			message: 'Session not found'
		});
	});

	rollbackTest('lists the caller`s closed unabsorbed sessions oldest first, capped at 200', async (db) => {
		const { mia, task, actor } = await callerWithTask(db);
		const sam = await seedUser(db);
		const rows = Array.from({ length: 201 }, (_, index) => ({
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date(at('2026-02-01T00:00:00.000Z').valueOf() + index * 60_000),
			endedAt: new Date(at('2026-02-01T00:00:30.000Z').valueOf() + index * 60_000)
		}));
		await db.insert(taskfocusSessions).values(rows);
		await seedTaskFocusSession(db, {
			userId: sam.id,
			taskId: task.id,
			startedAt: at('2026-02-01T00:00:00.000Z'),
			endedAt: at('2026-02-01T00:10:00.000Z')
		});
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: at('2026-02-01T00:00:00.000Z'),
			endedAt: at('2026-02-01T00:10:00.000Z'),
			absorbedAt: at('2026-02-01T00:11:00.000Z')
		});

		const answer = await listUnabsorbedFocusSessions(testCtx({ db, now: NOW }), actor);

		expect(answer).toHaveLength(200);
		expect(answer[0]!.startedAt).toEqual(at('2026-02-01T00:00:00.000Z'));
		expect(answer.every((row) => row.userId === mia.id)).toBe(true);
	});

	rollbackTest('overlays whole minutes from summed sessions and the open start, caller-scoped', async (db) => {
		const { mia, task, actor } = await callerWithTask(db);
		const other = await seedTask(db, { title: 'Other', userId: mia.id });
		const sam = await seedUser(db);
		// Two 90 s sessions on one Task floor to 3 minutes, not 2.
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: at('2026-03-01T09:00:00.000Z'),
			endedAt: at('2026-03-01T09:01:30.000Z')
		});
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: at('2026-03-01T10:00:00.000Z'),
			endedAt: at('2026-03-01T10:01:30.000Z')
		});
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: other.id,
			startedAt: at('2026-03-01T11:00:00.000Z'),
			endedAt: null
		});
		// Absorbed and other users' rows never count.
		await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: at('2026-03-01T08:00:00.000Z'),
			endedAt: at('2026-03-01T08:10:00.000Z'),
			absorbedAt: at('2026-03-01T08:11:00.000Z')
		});
		await seedTaskFocusSession(db, {
			userId: sam.id,
			taskId: task.id,
			startedAt: at('2026-03-01T07:00:00.000Z'),
			endedAt: at('2026-03-01T07:30:00.000Z')
		});

		const overlay = await getPhoneFocusOverlay(testCtx({ db, now: NOW }), actor);

		expect(overlay.get(task.id)).toEqual({ phoneFocusMinutes: 3, phoneFocusStartedAt: null });
		expect(overlay.get(other.id)).toEqual({
			phoneFocusMinutes: 0,
			phoneFocusStartedAt: at('2026-03-01T11:00:00.000Z')
		});
		expect(overlay.size).toBe(2);
	});
});

