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
import {
	addMember,
	seedTask,
	seedTaskFamily,
	seedTaskFocusCommands,
	seedTaskFocusSession
} from './tasks.fixtures.server';
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
		await seedTaskFocusCommands(db, [
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
		await seedTaskFocusCommands(db, rows);

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

	// The two taskId cases must carry a real id, so each row builds its body.
	const badCommands: {
		label: string;
		body: (samsTaskId: string) => JsonValue;
		error: string;
	}[] = [
		{
			label: 'an unknown command',
			body: () => ({ command: 'pause' }),
			error: "Command must be 'start' or 'stop'"
		},
		{
			label: 'a start without a task',
			body: () => ({ command: 'start' }),
			error: 'taskId is required for start'
		},
		{
			label: 'an empty taskId',
			body: () => ({ command: 'stop', taskId: '' }),
			error: 'Invalid taskId'
		},
		{
			label: 'a numeric taskId',
			body: () => ({ command: 'stop', taskId: 7 }),
			error: 'Invalid taskId'
		},
		{
			label: 'an unknown start task',
			body: () => ({ command: 'start', taskId: 'no-such-task' }),
			error: 'Task not found'
		},
		{
			label: 'another user`s start task',
			body: (samsTaskId) => ({ command: 'start', taskId: samsTaskId }),
			error: 'Task not found'
		}
	];
	it.each(badCommands)('answers 400 $error for $label, enqueueing nothing', async ({ body, error }) => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const samsTask = await seedTask(db, { title: 'Sam`s', userId: sam.id });

		const res = await invoke(postCommand, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/commands',
			method: 'POST',
			body: body(samsTask.id)
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
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

	const ackCases: { label: string; id: string }[] = [
		{ label: 'the caller`s own id', id: 'cmd-mine' },
		{ label: 'another user`s id', id: 'cmd-sams' },
		{ label: 'an unknown id', id: 'no-such-command' }
	];
	it.each(ackCases)('acks $label with 204 and is idempotent', async ({ id }) => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		await seedTaskFocusCommands(db, [
			{ id: 'cmd-mine', userId: mia.id, command: 'start', taskId: null },
			{ id: 'cmd-sams', userId: sam.id, command: 'start', taskId: null }
		]);

		const first = await invoke(ackCommand, {
			ctx: ctx(),
			user: mia,
			params: { id },
			method: 'DELETE'
		});
		expect(first.status).toBe(204);
		expect(first.text).toBe('');
		expect(first.body).toBeNull();

		const again = await invoke(ackCommand, {
			ctx: ctx(),
			user: mia,
			params: { id },
			method: 'DELETE'
		});
		expect(again.status).toBe(204);
		expect(again.text).toBe('');

		const rows = await db.select().from(taskfocusCommands);
		// Only the caller's own row is ever deleted.
		expect(rows.map((row) => row.id).sort()).toEqual(
			id === 'cmd-mine' ? ['cmd-sams'] : ['cmd-mine', 'cmd-sams']
		);
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

	const badQueries: { label: string; query: Readonly<Record<string, string>> }[] = [
		{ label: 'no query', query: {} },
		{ label: 'unabsorbed=2', query: { unabsorbed: '2' } }
	];
	it.each(badQueries)('answers 400 for $label', async ({ query }) => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });

		const res = await invoke(getSessions, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			query
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Only ?unabsorbed=1 is supported' });
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
		// A finished POST is never refused while an open session exists — and
		// its whole row is the answer, not a subset.
		expect(finished.status).toBe(201);
		expect(finished.body).toEqual({
			session: {
				id: expect.any(String),
				taskId: task.id,
				startedAt,
				endedAt,
				source: 'phone',
				absorbedAt: null,
				createdAt: expect.stringMatching(ISO)
			}
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

	// Built per row from the real clock: a collected-at `now` would drift into
	// the 5-minute window while the file runs.
	const timeRuleRefusals: {
		label: string;
		body: (taskId: string) => JsonValue;
		error: string;
	}[] = [
		{
			label: 'a start 6 minutes ahead',
			body: (taskId) => ({
				taskId,
				startedAt: new Date(Date.now() + 6 * MINUTE).toISOString()
			}),
			error: 'startedAt is more than 5 minutes in the future'
		},
		{
			label: 'an endedAt equal to startedAt',
			body: (taskId) => {
				const started = new Date(Date.now() - 2 * HOUR).toISOString();
				return { taskId, startedAt: started, endedAt: started };
			},
			error: 'endedAt must be after startedAt'
		},
		{
			label: 'an endedAt before startedAt',
			body: (taskId) => ({
				taskId,
				startedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
				endedAt: new Date(Date.now() - 2 * HOUR - 1).toISOString()
			}),
			error: 'endedAt must be after startedAt'
		},
		{
			label: 'a span just over 12 hours',
			body: (taskId) => ({
				taskId,
				startedAt: new Date(Date.now() - 20 * HOUR).toISOString(),
				endedAt: new Date(Date.now() - 7 * HOUR + 1).toISOString()
			}),
			error: 'Session is longer than 12 hours'
		}
	];
	it.each(timeRuleRefusals)('answers 400 $error for $label', async ({ body, error }) => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });

		const res = await invoke(postSession, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			method: 'POST',
			body: body(task.id)
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
		expect(await db.select().from(taskfocusSessions)).toEqual([]);
	});

	const badSessionBodies: {
		label: string;
		body: (taskId: string, startedAt: string) => JsonValue;
		error: string;
	}[] = [
		{
			label: 'a missing taskId',
			body: (_taskId, startedAt) => ({ startedAt }),
			error: 'taskId is required'
		},
		{
			label: 'an empty taskId',
			body: (_taskId, startedAt) => ({ taskId: '', startedAt }),
			error: 'taskId is required'
		},
		{
			label: 'a missing startedAt',
			body: (taskId) => ({ taskId }),
			error: 'startedAt is required'
		},
		{
			label: 'an empty startedAt',
			body: (taskId) => ({ taskId, startedAt: '' }),
			error: 'startedAt is required'
		},
		{
			label: 'an unparseable startedAt',
			body: (taskId) => ({ taskId, startedAt: 'nope' }),
			error: 'Invalid startedAt'
		},
		{
			label: 'an unparseable endedAt',
			body: (taskId, startedAt) => ({ taskId, startedAt, endedAt: 'nope' }),
			error: 'Invalid endedAt'
		}
	];
	it.each(badSessionBodies)('answers 400 $error for $label', async ({ body, error }) => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const startedAt = new Date(Date.now() - HOUR).toISOString();

		const res = await invoke(postSession, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			method: 'POST',
			body: body(task.id, startedAt)
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
	});

	const malformedBodies: { label: string; raw?: string; body?: JsonValue }[] = [
		{ label: 'malformed JSON', raw: '{' },
		{ label: 'an array body', body: [] }
	];
	it.each(malformedBodies)('answers 400 Invalid JSON body for $label', async ({ raw, body }) => {
		const mia = await seedUser(testDb(), { firstName: 'Mia' });

		const res = await invoke(postSession, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			method: 'POST',
			...(raw === undefined ? { body: body as JsonValue } : { rawBody: raw })
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid JSON body' });
	});

	const unusableTasks: { label: string; pick: 'unknown' | 'personal' | 'archived' }[] = [
		{ label: 'an unknown task', pick: 'unknown' },
		{ label: 'another user`s personal task', pick: 'personal' },
		{ label: 'an archived task', pick: 'archived' }
	];
	it.each(unusableTasks)('answers 404 Task not found for $label', async ({ pick }) => {
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
		const taskId =
			pick === 'unknown' ? 'no-such-task' : pick === 'personal' ? samsPersonal.id : archived.id;
		const startedAt = new Date(Date.now() - HOUR).toISOString();

		const res = await invoke(postSession, {
			ctx: ctx(),
			user: mia,
			path: '/api/taskfocus/sessions',
			method: 'POST',
			body: { taskId, startedAt }
		});
		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Task not found' });
	});

	it('accepts a family member`s task', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const home = await seedTaskFamily(db);
		await addMember(db, mia.id, home.id);
		await addMember(db, sam.id, home.id);
		const samsFamily = await seedTask(db, {
			title: 'Family task',
			familyId: home.id,
			userId: sam.id
		});
		const startedAt = new Date(Date.now() - HOUR).toISOString();

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
			session: {
				id: session.id,
				taskId: task.id,
				startedAt: session.startedAt.toISOString(),
				endedAt: firstEnd,
				source: 'phone',
				absorbedAt: null,
				createdAt: session.createdAt.toISOString()
			}
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
			session: {
				id: session.id,
				taskId: task.id,
				startedAt: session.startedAt.toISOString(),
				endedAt: secondEnd,
				source: 'phone',
				absorbedAt: null,
				createdAt: session.createdAt.toISOString()
			}
		});
		const [row] = await db
			.select()
			.from(taskfocusSessions)
			.where(eq(taskfocusSessions.id, session.id));
		expect(row.endedAt?.toISOString()).toBe(secondEnd);
	});

	// Each row seeds its own session 20 hours back and builds its body from the
	// real clock, so the 12-hour bound and "after startedAt" stay unambiguous.
	const badPatchBodies: {
		label: string;
		create: () => { startedAt: Date; body: JsonValue };
		error: string;
	}[] = [
		{
			label: 'a missing endedAt',
			create: () => ({ startedAt: new Date(Date.now() - 20 * HOUR), body: {} }),
			error: 'endedAt is required'
		},
		{
			label: 'an empty endedAt',
			create: () => ({ startedAt: new Date(Date.now() - 20 * HOUR), body: { endedAt: '' } }),
			error: 'endedAt is required'
		},
		{
			label: 'an unparseable endedAt',
			create: () => ({ startedAt: new Date(Date.now() - 20 * HOUR), body: { endedAt: 'nope' } }),
			error: 'Invalid endedAt'
		},
		{
			label: 'an endedAt equal to startedAt',
			create: () => {
				const startedAt = new Date(Date.now() - 20 * HOUR);
				return { startedAt, body: { endedAt: startedAt.toISOString() } };
			},
			error: 'endedAt must be after startedAt'
		},
		{
			label: 'a span over 12 hours',
			create: () => {
				const startedAt = new Date(Date.now() - 20 * HOUR);
				return {
					startedAt,
					body: { endedAt: new Date(startedAt.getTime() + 12 * HOUR + 1).toISOString() }
				};
			},
			error: 'Session is longer than 12 hours'
		}
	];
	it.each(badPatchBodies)('answers 400 $error for $label', async ({ create, error }) => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const { startedAt, body } = create();
		const session = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt
		});

		const res = await invoke(patchSession, {
			ctx: ctx(),
			user: mia,
			params: { id: session.id },
			method: 'PATCH',
			body
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
	});

	it('answers 400 Invalid JSON body for malformed JSON', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const session = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - 20 * HOUR)
		});

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

	const foreignPatchIds: { label: string; pick: 'unknown' | 'foreign' }[] = [
		{ label: 'an unknown session', pick: 'unknown' },
		{ label: 'another user`s session', pick: 'foreign' }
	];
	it.each(foreignPatchIds)('answers 404 Session not found for $label', async ({ pick }) => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const sams = await seedTaskFocusSession(db, {
			userId: sam.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - 2 * HOUR)
		});
		const endedAt = new Date(Date.now() - MINUTE).toISOString();

		const res = await invoke(patchSession, {
			ctx: ctx(),
			user: mia,
			params: { id: pick === 'unknown' ? 'no-such-session' : sams.id },
			method: 'PATCH',
			body: { endedAt }
		});
		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Session not found' });
	});

	it('answers 409 Session already absorbed once absorbed', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const absorbed = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - 3 * HOUR),
			endedAt: new Date(Date.now() - 2 * HOUR),
			absorbedAt: new Date(Date.now() - HOUR)
		});
		const endedAt = new Date(Date.now() - MINUTE).toISOString();

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

	const foreignDeleteIds: { label: string; pick: 'unknown' | 'foreign' }[] = [
		{ label: 'an unknown session', pick: 'unknown' },
		{ label: 'another user`s session', pick: 'foreign' }
	];
	it.each(foreignDeleteIds)('answers 404 Session not found for $label', async ({ pick }) => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const sams = await seedTaskFocusSession(db, {
			userId: sam.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - HOUR)
		});

		const res = await invoke(deleteSession, {
			ctx: ctx(),
			user: mia,
			params: { id: pick === 'unknown' ? 'no-such-session' : sams.id },
			method: 'DELETE'
		});
		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Session not found' });
	});

	it('answers 409 Session already absorbed once absorbed', async () => {
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
		await seedTaskFocusSession(db, {
			userId: sam.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - HOUR)
		});

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
			session: {
				id: session.id,
				taskId: task.id,
				startedAt: session.startedAt.toISOString(),
				endedAt: session.endedAt?.toISOString(),
				source: 'phone',
				absorbedAt: expect.stringMatching(ISO),
				createdAt: session.createdAt.toISOString()
			}
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
			session: {
				id: session.id,
				taskId: task.id,
				startedAt: session.startedAt.toISOString(),
				endedAt: session.endedAt?.toISOString(),
				source: 'phone',
				absorbedAt: stamp,
				createdAt: session.createdAt.toISOString()
			}
		});
	});

	it('answers 409 Only closed sessions can be absorbed for an open session', async () => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const open = await seedTaskFocusSession(db, {
			userId: mia.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - HOUR)
		});

		const refused = await invoke(absorbSession, {
			ctx: ctx(),
			user: mia,
			params: { id: open.id },
			method: 'POST'
		});
		expect(refused.status).toBe(409);
		expect(refused.body).toEqual({ error: 'Only closed sessions can be absorbed' });
	});

	const foreignAbsorbIds: { label: string; pick: 'unknown' | 'foreign' }[] = [
		{ label: 'an unknown session', pick: 'unknown' },
		{ label: 'another user`s session', pick: 'foreign' }
	];
	it.each(foreignAbsorbIds)('answers 404 Session not found for $label', async ({ pick }) => {
		const db = testDb();
		const mia = await seedUser(db, { firstName: 'Mia' });
		const sam = await seedUser(db, { firstName: 'Sam' });
		const task = await seedTask(db, { title: 'Focus me', userId: mia.id });
		const sams = await seedTaskFocusSession(db, {
			userId: sam.id,
			taskId: task.id,
			startedAt: new Date(Date.now() - 3 * HOUR),
			endedAt: new Date(Date.now() - 2 * HOUR)
		});

		const res = await invoke(absorbSession, {
			ctx: ctx(),
			user: mia,
			params: { id: pick === 'unknown' ? 'no-such-session' : sams.id },
			method: 'POST'
		});
		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Session not found' });
	});
});

describe('signed out', () => {
	beforeEach(truncateAll);

	const calls: {
		label: string;
		call: () => Promise<{ status: number; body: JsonValue | null }>;
	}[] = [
		{
			label: 'GET /api/taskfocus/commands',
			call: () => invoke(getCommands, { ctx: ctx(), path: '/api/taskfocus/commands' })
		},
		{
			label: 'POST /api/taskfocus/commands',
			call: () =>
				invoke(postCommand, {
					ctx: ctx(),
					path: '/api/taskfocus/commands',
					method: 'POST',
					body: { command: 'stop' }
				})
		},
		{
			label: 'DELETE /api/taskfocus/commands/[id]',
			call: () => invoke(ackCommand, { ctx: ctx(), params: { id: 'x' }, method: 'DELETE' })
		},
		{
			label: 'GET /api/taskfocus/sessions',
			call: () =>
				invoke(getSessions, {
					ctx: ctx(),
					path: '/api/taskfocus/sessions',
					query: { unabsorbed: '1' }
				})
		},
		{
			label: 'POST /api/taskfocus/sessions',
			call: () =>
				invoke(postSession, {
					ctx: ctx(),
					path: '/api/taskfocus/sessions',
					method: 'POST',
					body: {}
				})
		},
		{
			label: 'PATCH /api/taskfocus/sessions/[id]',
			call: () =>
				invoke(patchSession, {
					ctx: ctx(),
					params: { id: 'x' },
					method: 'PATCH',
					body: {}
				})
		},
		{
			label: 'DELETE /api/taskfocus/sessions/[id]',
			call: () => invoke(deleteSession, { ctx: ctx(), params: { id: 'x' }, method: 'DELETE' })
		},
		{
			label: 'POST /api/taskfocus/sessions/[id]/absorb',
			call: () => invoke(absorbSession, { ctx: ctx(), params: { id: 'x' }, method: 'POST' })
		}
	];
	it.each(calls)('answers 401 {"error":"Unauthorized"} on $label', async ({ call }) => {
		const res = await call();
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});
});
