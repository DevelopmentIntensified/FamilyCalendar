/**
 * Golden contract tests for the TaskFocus device channel:
 * `/api/taskfocus/commands` (GET, POST, DELETE :id) and
 * `/api/taskfocus/sessions` (GET, POST, PATCH :id, DELETE :id, absorb).
 *
 * They pin TODAY's legacy wire (docs/rewrite/playbooks/characterize-endpoints.md).
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	taskfocusCommands,
	taskfocusSessions
} from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
import { addMember, seedTaskFamily, seedTaskFocusSession, seedTask } from './tasks.fixtures.server';
// Route modules, not actions: after the port these re-export the new handlers.
import {
	GET as getCommands,
	POST as postCommand
} from '../../../routes/api/taskfocus/commands/+server';
import { DELETE as ackCommand } from '../../../routes/api/taskfocus/commands/[id]/+server';
import {
	GET as getSessions,
	POST as postSession
} from '../../../routes/api/taskfocus/sessions/+server';
import {
	DELETE as deleteSession,
	PATCH as patchSession
} from '../../../routes/api/taskfocus/sessions/[id]/+server';
import { POST as absorbSession } from '../../../routes/api/taskfocus/sessions/[id]/absorb/+server';

const ctx = () => testCtx({ db: testDb() });
const ISO = /^\d{4}-\d{2}-\d{2}T/;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('GET /api/taskfocus/commands', () => {
	beforeEach(truncateAll);

	it('returns the queue oldest first and drops commands older than 10 minutes on read', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const now = Date.now();
		const older = new Date(now - 5000);
		const newer = new Date(now - 1000);
		await db.insert(taskfocusCommands).values([
			{
				id: 'cmd-stale',
				userId: mia.id,
				command: 'start',
				issuedAt: new Date(now - 11 * MINUTE)
			},
			{ id: 'cmd-newer', userId: mia.id, command: 'stop', taskId: null, issuedAt: newer },
			{ id: 'cmd-older', userId: mia.id, command: 'start', taskId: null, issuedAt: older }
		]);

		const res = await invoke(getCommands, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/commands'
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			commands: [
				{ id: 'cmd-older', command: 'start', taskId: null, issuedAt: older.toISOString() },
				{ id: 'cmd-newer', command: 'stop', taskId: null, issuedAt: newer.toISOString() }
			]
		});
		const rows = await db.select().from(taskfocusCommands);
		expect(rows.map((row) => row.id).sort()).toEqual(['cmd-newer', 'cmd-older']);
	});

	it('caps one read at 25 commands', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const base = Date.now() - 60_000;
		const rows = Array.from({ length: 26 }, (_, index) => ({
			id: `cmd-${String(index).padStart(2, '0')}`,
			userId: mia.id,
			command: 'stop',
			taskId: null,
			issuedAt: new Date(base + index * 1000)
		}));
		await db.insert(taskfocusCommands).values(rows);

		const res = await invoke(getCommands, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/commands'
		});

		expect(res.body).toEqual({
			commands: rows.slice(0, 25).map((row) => ({
				id: row.id,
				command: 'stop',
				taskId: null,
				issuedAt: row.issuedAt.toISOString()
			}))
		});
	});
});

describe('POST /api/taskfocus/commands', () => {
	beforeEach(truncateAll);

	it('enqueues start for the caller`s own task and stop without a task', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });

		const start = await invoke(postCommand, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/commands',
			method: 'POST',
			body: { command: 'start', taskId: task.id }
		});
		expect(start.status).toBe(201);
		expect(start.body).toEqual({
			id: expect.any(String),
			command: 'start',
			taskId: task.id,
			issuedAt: expect.stringMatching(ISO)
		});

		const stop = await invoke(postCommand, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/commands',
			method: 'POST',
			body: { command: 'stop' }
		});
		expect(stop.status).toBe(201);
		expect(stop.body).toEqual({
			id: expect.any(String),
			command: 'stop',
			taskId: null,
			issuedAt: expect.stringMatching(ISO)
		});
		expect(await db.select().from(taskfocusCommands)).toHaveLength(2);
	});

	it('rejects a bad command, a missing start task and an unusable taskId', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const samsTask = await seedTask(db, { title: 'Sam`s', userId: sam.id });

		const cases: { body: JsonValue; error: string }[] = [
			{ body: { command: 'pause' }, error: "Command must be 'start' or 'stop'" },
			{ body: { command: 'start' }, error: 'taskId is required for start' },
			{ body: { command: 'stop', taskId: '' }, error: 'Invalid taskId' },
			{ body: { command: 'stop', taskId: 7 }, error: 'Invalid taskId' },
			{ body: { command: 'start', taskId: 'no-such-task' }, error: 'Task not found' },
			{ body: { command: 'start', taskId: samsTask.id }, error: 'Task not found' }
		];
		for (const testCase of cases) {
			const res = await invoke(postCommand, {
				ctx: ctx(),
				user: mia,
				path: '/api/taskfocus/commands',
				method: 'POST',
				body: testCase.body
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: testCase.error });
		}
		expect(await db.select().from(taskfocusCommands)).toEqual([]);
	});

	it('validates taskId ownership even for stop (probably accidental)', async () => {
		// TODAY's wire: a stop carrying a foreign task id is a 400, though stop
		// ignores the id and the spec says stop may carry none.
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const samsTask = await seedTask(db, { title: 'Sam`s', userId: sam.id });

		const res = await invoke(postCommand, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/commands',
			method: 'POST',
			body: { command: 'stop', taskId: samsTask.id }
		});

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Task not found' });
	});
});

describe('DELETE /api/taskfocus/commands/[id]', () => {
	beforeEach(truncateAll);

	it('acks a command with 204 and is idempotent for unknown or foreign ids', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		await db.insert(taskfocusCommands).values([
			{ id: 'cmd-mine', userId: mia.id, command: 'start', taskId: null },
			{ id: 'cmd-sams', userId: sam.id, command: 'start', taskId: null }
		]);

		const acked = await invoke(ackCommand, {
			ctx: ctx(),
			user: mia,
			params: { id: 'cmd-mine' },
			method: 'DELETE'
		});
		expect(acked.status).toBe(204);
		expect(acked.text).toBe('');
		expect(acked.body).toBeNull();

		for (const id of ['cmd-mine', 'cmd-sams', 'no-such-command']) {
			const res = await invoke(ackCommand, {
				ctx: ctx(),
				user: mia,
				params: { id },
				method: 'DELETE'
			});
			expect(res.status).toBe(204);
		}
		const rows = await db.select().from(taskfocusCommands);
		expect(rows.map((row) => row.id)).toEqual(['cmd-sams']);
	});
});

describe('GET /api/taskfocus/sessions', () => {
	beforeEach(truncateAll);

	it('returns the caller`s closed unabsorbed sessions oldest first', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const first = await seedTaskFocusSession(db, {
			id: 'ses-first',
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date('2026-01-01T09:00:00.000Z'),
			endedAt: new Date('2026-01-01T09:10:00.000Z')
		});
		const second = await seedTaskFocusSession(db, {
			id: 'ses-second',
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date('2026-01-01T10:00:00.000Z'),
			endedAt: new Date('2026-01-01T10:05:00.000Z')
		});
		// Open, absorbed and another user's rows are all excluded.
		await seedTaskFocusSession(db, {
			id: 'ses-open',
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date('2026-01-01T11:00:00.000Z')
		});
		await seedTaskFocusSession(db, {
			id: 'ses-absorbed',
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date('2026-01-01T08:00:00.000Z'),
			endedAt: new Date('2026-01-01T08:05:00.000Z'),
			absorbedAt: new Date('2026-01-02T08:00:00.000Z')
		});
		await seedTaskFocusSession(db, {
			id: 'ses-sams',
			userId: sam.id,
			taskId: task.id,
			startedAt: new Date('2026-01-01T07:00:00.000Z'),
			endedAt: new Date('2026-01-01T07:05:00.000Z')
		});

		const res = await invoke(getSessions, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			query: { unabsorbed: '1' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			sessions: [
				{
					id: first.id,
					taskId: task.id,
					startedAt: '2026-01-01T09:00:00.000Z',
					endedAt: '2026-01-01T09:10:00.000Z',
					source: 'phone'
				},
				{
					id: second.id,
					taskId: task.id,
					startedAt: '2026-01-01T10:00:00.000Z',
					endedAt: '2026-01-01T10:05:00.000Z',
					source: 'phone'
				}
			]
		});
	});

	it('answers 400 unless the query is exactly ?unabsorbed=1', async () => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });
		const queries: Readonly<Record<string, string>>[] = [{}, { unabsorbed: '2' }];
		for (const query of queries) {
			const res = await invoke(getSessions, {
				ctx: ctx(),
				user: mia,
				path: '/api/taskfocus/sessions',
				query
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Only ?unabsorbed=1 is supported' });
		}
	});
});

describe('POST /api/taskfocus/sessions', () => {
	beforeEach(truncateAll);

	it('starts an open session and records a finished one', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const startedAt = new Date(Date.now() - 2 * HOUR).toISOString();

		const open = await invoke(postSession, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			method: 'POST',
			body: { taskId: task.id, startedAt }
		});
		expect(open.status).toBe(201);
		expect(open.body).toEqual({
			session: {
				id: expect.any(String),
				taskId: task.id,
				startedAt,
				endedAt: null,
				source: 'phone',
				absorbedAt: null,
				createdAt: expect.stringMatching(ISO)
			}
		});

		const endedAt = new Date(Date.now() - 90 * MINUTE).toISOString();
		const finished = await invoke(postSession, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			method: 'POST',
			body: { taskId: task.id, startedAt, endedAt }
		});
		// A finished POST is never refused while an open session exists.
		expect(finished.status).toBe(201);
		expect(finished.body).toEqual({
			session: expect.objectContaining({ taskId: task.id, startedAt, endedAt })
		});
	});

	it('answers 409 with the open session id when a start is already running', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const open = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - HOUR)
		});

		const res = await invoke(postSession, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			method: 'POST',
			body: { taskId: task.id, startedAt: new Date(Date.now() - MINUTE).toISOString() }
		});

		expect(res.status).toBe(409);
		expect(res.body).toEqual({
			error: 'A phone focus session is already running',
			openSessionId: open.id
		});
	});

	it('enforces the time rules, both bounds inclusive', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const now = Date.now();

		const refusals: { body: JsonValue; error: string }[] = [
			{
				body: {
					taskId: task.id,
					startedAt: new Date(now + 6 * MINUTE).toISOString()
				},
				error: 'startedAt is more than 5 minutes in the future'
			},
			{
				body: {
					taskId: task.id,
					startedAt: new Date(now - 2 * HOUR).toISOString(),
					endedAt: new Date(now - 2 * HOUR).toISOString()
				},
				error: 'endedAt must be after startedAt'
			},
			{
				body: {
					taskId: task.id,
					startedAt: new Date(now - 2 * HOUR).toISOString(),
					endedAt: new Date(now - 2 * HOUR - 1).toISOString()
				},
				error: 'endedAt must be after startedAt'
			},
			{
				body: {
					taskId: task.id,
					startedAt: new Date(now - 20 * HOUR).toISOString(),
					endedAt: new Date(now - 7 * HOUR + 1).toISOString()
				},
				error: 'Session is longer than 12 hours'
			}
		];
		for (const testCase of refusals) {
			const res = await invoke(postSession, {
				ctx: ctx(),
				user: mia,
				path: '/api/taskfocus/sessions',
				method: 'POST',
				body: testCase.body
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: testCase.error });
		}

		// Exactly 5 minutes ahead and exactly 12 hours long both pass.
		const fiveAhead = await invoke(postSession, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			method: 'POST',
			body: { taskId: task.id, startedAt: new Date(now + 5 * MINUTE).toISOString() }
		});
		expect(fiveAhead.status).toBe(201);

		const twelveHours = await invoke(postSession, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			method: 'POST',
			body: {
				taskId: task.id,
				startedAt: new Date(now - 13 * HOUR).toISOString(),
				endedAt: new Date(now - HOUR).toISOString()
			}
		});
		expect(twelveHours.status).toBe(201);
	});

	it('answers the legacy 400s for missing, invalid or malformed input', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const startedAt = new Date(Date.now() - HOUR).toISOString();

		const cases: { body: JsonValue; error: string }[] = [
			{ body: { startedAt }, error: 'taskId is required' },
			{ body: { taskId: '', startedAt }, error: 'taskId is required' },
			{ body: { taskId: task.id }, error: 'startedAt is required' },
			{ body: { taskId: task.id, startedAt: '' }, error: 'startedAt is required' },
			{ body: { taskId: task.id, startedAt: 'nope' }, error: 'Invalid startedAt' },
			{
				body: { taskId: task.id, startedAt, endedAt: 'nope' },
				error: 'Invalid endedAt'
			}
		];
		for (const testCase of cases) {
			const res = await invoke(postSession, {
				ctx: ctx(),
				user: mia,
				path: '/api/taskfocus/sessions',
				method: 'POST',
				body: testCase.body
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: testCase.error });
		}

		const malformed = await invoke(postSession, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			method: 'POST',
			rawBody: '{'
		});
		expect(malformed.status).toBe(400);
		expect(malformed.body).toEqual({ error: 'Invalid JSON body' });

		const arrayBody = await invoke(postSession, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			method: 'POST',
			body: []
		});
		expect(arrayBody.status).toBe(400);
		expect(arrayBody.body).toEqual({ error: 'Invalid JSON body' });
	});

	it('answers 404 for a task the caller cannot see and accepts a family member`s task', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const home = await seedTaskFamily(db);
		await addMember(db, mia.id, home.id);
		await addMember(db, sam.id, home.id);
		const samsPersonal = await seedTask(db, { title: 'Sam only', userId: sam.id });
		const archived = await seedTask(db, {
			title: 'Archived',
			archivedAt: '2026-01-01T00:00:00.000Z',
			userId: mia.id
		});
		const samsFamily = await seedTask(db, {
			title: 'Family task',
			familyId: home.id,
			userId: sam.id
		});
		const startedAt = new Date(Date.now() - HOUR).toISOString();

		for (const taskId of ['no-such-task', samsPersonal.id, archived.id]) {
			const res = await invoke(postSession, {
				ctx: ctx(),
				user: mia,
				path: '/api/taskfocus/sessions',
				method: 'POST',
				body: { taskId, startedAt }
			});
			expect(res.status).toBe(404);
			expect(res.body).toEqual({ error: 'Task not found' });
		}

		const familyTask = await invoke(postSession, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			method: 'POST',
			body: { taskId: samsFamily.id, startedAt }
		});
		expect(familyTask.status).toBe(201);
	});
});

describe('PATCH /api/taskfocus/sessions/[id]', () => {
	beforeEach(truncateAll);

	it('closes an open session and a repeat PATCH overwrites endedAt', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const session = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - 2 * HOUR)
		});
		const firstEnd = new Date(Date.now() - HOUR).toISOString();

		const closed = await invoke(patchSession, {
			ctx: ctx(),
			user: mia,
			params: { id: session.id },
			method: 'PATCH',
			body: { endedAt: firstEnd }
		});
		expect(closed.status).toBe(200);
		expect(closed.body).toEqual({
			session: expect.objectContaining({ id: session.id, endedAt: firstEnd })
		});

		const secondEnd = new Date(Date.now() - 30 * MINUTE).toISOString();
		const again = await invoke(patchSession, {
			ctx: ctx(),
			user: mia,
			params: { id: session.id },
			method: 'PATCH',
			body: { endedAt: secondEnd }
		});
		expect(again.status).toBe(200);
		expect(again.body).toEqual({
			session: expect.objectContaining({ endedAt: secondEnd })
		});
		const [row] = await db
			.select()
			.from(taskfocusSessions)
			.where(eq(taskfocusSessions.id, session.id));
		expect(row.endedAt?.toISOString()).toBe(secondEnd);
	});

	it('answers the legacy 400s and the 12-hour bound', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const startedAt = new Date(Date.now() - 20 * HOUR);
		const session = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt
		});

		const cases: { body: JsonValue; error: string }[] = [
			{ body: {}, error: 'endedAt is required' },
			{ body: { endedAt: '' }, error: 'endedAt is required' },
			{ body: { endedAt: 'nope' }, error: 'Invalid endedAt' },
			{
				body: { endedAt: startedAt.toISOString() },
				error: 'endedAt must be after startedAt'
			},
			{
				body: { endedAt: new Date(startedAt.getTime() + 12 * HOUR + 1).toISOString() },
				error: 'Session is longer than 12 hours'
			}
		];
		for (const testCase of cases) {
			const res = await invoke(patchSession, {
				ctx: ctx(),
				user: mia,
				params: { id: session.id },
				method: 'PATCH',
				body: testCase.body
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: testCase.error });
		}

		const malformed = await invoke(patchSession, {
			ctx: ctx(),
			user: mia,
			params: { id: session.id },
			method: 'PATCH',
			rawBody: '{'
		});
		expect(malformed.status).toBe(400);
		expect(malformed.body).toEqual({ error: 'Invalid JSON body' });
	});

	it('answers 404 for an unknown or foreign session and 409 once absorbed', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const absorbed = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - 3 * HOUR),
			endedAt: new Date(Date.now() - 2 * HOUR),
			absorbedAt: new Date(Date.now() - HOUR)
		});
		const sams = await seedTaskFocusSession(db, {
			userId: sam.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - 2 * HOUR)
		});
		const endedAt = new Date(Date.now() - MINUTE).toISOString();

		for (const id of ['no-such-session', sams.id]) {
			const res = await invoke(patchSession, {
				ctx: ctx(),
				user: mia,
				params: { id },
				method: 'PATCH',
				body: { endedAt }
			});
			expect(res.status).toBe(404);
			expect(res.body).toEqual({ error: 'Session not found' });
		}

		const refused = await invoke(patchSession, {
			ctx: ctx(),
			user: mia,
			params: { id: absorbed.id },
			method: 'PATCH',
			body: { endedAt }
		});
		expect(refused.status).toBe(409);
		expect(refused.body).toEqual({ error: 'Session already absorbed' });
	});
});

describe('DELETE /api/taskfocus/sessions/[id]', () => {
	beforeEach(truncateAll);

	it('discards an open or a closed unabsorbed session', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const open = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - HOUR)
		});

		const first = await invoke(deleteSession, {
			ctx: ctx(),
			user: mia,
			params: { id: open.id },
			method: 'DELETE'
		});
		expect(first.status).toBe(200);
		expect(first.body).toEqual({ success: true });

		const closed = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - 3 * HOUR),
			endedAt: new Date(Date.now() - 2 * HOUR)
		});
		const second = await invoke(deleteSession, {
			ctx: ctx(),
			user: mia,
			params: { id: closed.id },
			method: 'DELETE'
		});
		expect(second.status).toBe(200);
		expect(second.body).toEqual({ success: true });
		expect(await db.select().from(taskfocusSessions)).toEqual([]);
	});

	it('answers 404 for gone, unknown or foreign ids and 409 once absorbed', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const absorbed = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - 3 * HOUR),
			endedAt: new Date(Date.now() - 2 * HOUR),
			absorbedAt: new Date(Date.now() - HOUR)
		});
		const sams = await seedTaskFocusSession(db, {
			userId: sam.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - HOUR)
		});

		for (const id of ['no-such-session', sams.id]) {
			const res = await invoke(deleteSession, {
				ctx: ctx(),
				user: mia,
				params: { id },
				method: 'DELETE'
			});
			expect(res.status).toBe(404);
			expect(res.body).toEqual({ error: 'Session not found' });
		}

		const refused = await invoke(deleteSession, {
			ctx: ctx(),
			user: mia,
			params: { id: absorbed.id },
			method: 'DELETE'
		});
		expect(refused.status).toBe(409);
		expect(refused.body).toEqual({ error: 'Session already absorbed' });
		expect(await db.select().from(taskfocusSessions)).toHaveLength(2);
	});
});

describe('POST /api/taskfocus/sessions/[id]/absorb', () => {
	beforeEach(truncateAll);

	it('absorbs a closed session and repeats idempotently with the original stamp', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const session = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - 3 * HOUR),
			endedAt: new Date(Date.now() - 2 * HOUR)
		});

		const first = await invoke(absorbSession, {
			ctx: ctx(),
			user: mia,
			params: { id: session.id },
			method: 'POST'
		});
		expect(first.status).toBe(200);
		expect(first.body).toEqual({
			session: expect.objectContaining({ id: session.id, absorbedAt: expect.stringMatching(ISO) })
		});
		const [row] = await db
			.select()
			.from(taskfocusSessions)
			.where(eq(taskfocusSessions.id, session.id));
		const stamp = row.absorbedAt?.toISOString();
		expect(stamp).toEqual(expect.any(String));

		const again = await invoke(absorbSession, {
			ctx: ctx(),
			user: mia,
			params: { id: session.id },
			method: 'POST'
		});
		expect(again.status).toBe(200);
		expect(again.body).toEqual({
			session: expect.objectContaining({ id: session.id, absorbedAt: stamp })
		});
	});

	it('answers 409 for an open session and 404 for unknown or foreign ids', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const open = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - HOUR)
		});
		const sams = await seedTaskFocusSession(db, {
			userId: sam.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - 3 * HOUR),
			endedAt: new Date(Date.now() - 2 * HOUR)
		});

		const refused = await invoke(absorbSession, {
			ctx: ctx(),
			user: mia,
			params: { id: open.id },
			method: 'POST'
		});
		expect(refused.status).toBe(409);
		expect(refused.body).toEqual({ error: 'Only closed sessions can be absorbed' });

		for (const id of ['no-such-session', sams.id]) {
			const res = await invoke(absorbSession, {
				ctx: ctx(),
				user: mia,
				params: { id },
				method: 'POST'
			});
			expect(res.status).toBe(404);
			expect(res.body).toEqual({ error: 'Session not found' });
		}
	});
});

describe('signed out', () => {
	beforeEach(truncateAll);

	it('answers 401 {"error":"Unauthorized"} on every TaskFocus route', async () => {
		const calls = [
			() => invoke(getCommands, { ctx: ctx(), path: '/api/taskfocus/commands' }),
			() =>
				invoke(postCommand, {
					ctx: ctx(),
					path: '/api/taskfocus/commands',
					method: 'POST',
					body: { command: 'stop' }
				}),
			() =>
				invoke(ackCommand, {
					ctx: ctx(),
					params: { id: 'x' },
					method: 'DELETE'
				}),
			() =>
				invoke(getSessions, {
					ctx: ctx(),
					path: '/api/taskfocus/sessions',
					query: { unabsorbed: '1' }
				}),
			() =>
				invoke(postSession, {
					ctx: ctx(),
					path: '/api/taskfocus/sessions',
					method: 'POST',
					body: {}
				}),
			() =>
				invoke(patchSession, {
					ctx: ctx(),
					params: { id: 'x' },
					method: 'PATCH',
					body: {}
				}),
			() => invoke(deleteSession, { ctx: ctx(), params: { id: 'x' }, method: 'DELETE' }),
			() => invoke(absorbSession, { ctx: ctx(), params: { id: 'x' }, method: 'POST' })
		];
		for (const call of calls) {
			const res = await call();
			expect(res.status).toBe(401);
			expect(res.body).toEqual({ error: 'Unauthorized' });
		}
	});
});
