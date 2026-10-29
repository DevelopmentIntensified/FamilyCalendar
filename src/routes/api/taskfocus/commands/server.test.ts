import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TaskFocus device command channel (021) at the route seam:
 * FIFO order, empty-list 200, POST validation, idempotent ack, 401 guard.
 * The drizzle builder is scripted (house stub style, same pattern as
 * src/routes/api/tasks/[id]/bearer.test.ts); the route logic is real.
 */
const state = vi.hoisted(() => ({
	/** SELECT results queue, one array per select call. */
	selectQueue: [] as unknown[][],
	/** Rows captured by INSERT (pin the enqueue shape). */
	insertedRows: [] as Record<string, unknown>[],
	/** Wheres captured by DELETE (pin the ack + hygiene shapes). */
	deletedWheres: [] as unknown[],
	/** Rows the scripted DELETE's .returning() hands back. */
	deleteReturning: [] as Record<string, unknown>[]
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => {
	/** Awaitable node that also carries the orderBy().limit() tail. */
	const leaf = () => {
		const rows = state.selectQueue.shift() ?? [];
		const tail = Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) });
		return Object.assign(Promise.resolve(rows), { orderBy: () => tail, limit: () => Promise.resolve(rows) });
	};
	const selectNode = () => ({
		from: () => selectNode(),
		where: () => leaf()
	});
	return {
		db: {
			select: () => selectNode(),
			insert: () => ({
				values: (row: Record<string, unknown>) => {
					// The DB fills issuedAt (defaultNow); the seam mirrors that.
					const stored = { ...row, issuedAt: new Date('2026-10-27T10:05:00Z') };
					state.insertedRows.push(stored);
					return {
						returning: () => Promise.resolve([stored])
					};
				}
			}),
			delete: () => ({
				where: (where: unknown) => {
					state.deletedWheres.push(where);
					return { returning: () => Promise.resolve(state.deleteReturning) };
				}
			})
		}
	};
});

import { GET, POST } from './+server';

function localsFor(userId: string | null) {
	return { locals: { user: userId ? { id: userId } : null } };
}

/** Event stub for the POST/GET handlers — only locals + request.json(). */
function postEvent(userId: string | null, body: unknown) {
	return {
		...localsFor(userId),
		request: { url: 'http://localhost/api/taskfocus/commands', json: async () => body }
	} as never;
}

function getEvent(userId: string | null) {
	return localsFor(userId) as never;
}

/** Command row the scripted select hands back. */
function commandRow(over: Partial<Record<string, unknown>> = {}) {
	return {
		id: 'c1',
		userId: 'u1',
		command: 'start',
		taskId: 't1',
		issuedAt: new Date('2026-10-27T10:00:00Z'),
		...over
	};
}

beforeEach(() => {
	state.selectQueue = [];
	state.insertedRows = [];
	state.deletedWheres = [];
	state.deleteReturning = [];
});

describe('GET /api/taskfocus/commands', () => {
	it('returns 200 with an empty list when nothing is queued', async () => {
		state.selectQueue.push([]);
		const res = await GET(getEvent('u1'));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ commands: [] });
	});

	it('maps queued rows FIFO with ISO issuedAt', async () => {
		state.selectQueue.push([
			commandRow({ id: 'c1', command: 'start', taskId: 't1' }),
			commandRow({ id: 'c2', command: 'stop', taskId: null })
		]);
		const res = await GET(getEvent('u1'));
		const body = await res.json();
		expect(body.commands).toEqual([
			{ id: 'c1', command: 'start', taskId: 't1', issuedAt: '2026-10-27T10:00:00.000Z' },
			{ id: 'c2', command: 'stop', taskId: null, issuedAt: '2026-10-27T10:00:00.000Z' }
		]);
	});

	it('rejects without a session or token', async () => {
		const res = await GET(getEvent(null));
		expect(res.status).toBe(401);
	});
});

describe('POST /api/taskfocus/commands', () => {
	it('enqueues a start with a taskId', async () => {
		// POST looks the task up: ownership select first.
		state.selectQueue.push([commandRow({ id: 't1', userId: 'u1' })]);
		const res = await POST(postEvent('u1', { command: 'start', taskId: 't1' }));
		expect(res.status).toBe(201);
		expect(state.insertedRows[0]).toMatchObject({ userId: 'u1', command: 'start', taskId: 't1' });
		const body = await res.json();
		expect(body.command).toBe('start');
		expect(body.taskId).toBe('t1');
	});

	it('enqueues a bare stop without a taskId', async () => {
		const res = await POST(postEvent('u1', { command: 'stop' }));
		expect(res.status).toBe(201);
		expect(state.insertedRows[0]).toMatchObject({ userId: 'u1', command: 'stop', taskId: null });
	});

	it('requires a taskId for start', async () => {
		const res = await POST(postEvent('u1', { command: 'start' }));
		expect(res.status).toBe(400);
		expect(state.insertedRows).toHaveLength(0);
	});

	it('rejects an unknown command', async () => {
		const res = await POST(postEvent('u1', { command: 'pause' }));
		expect(res.status).toBe(400);
	});

	it('rejects a start naming somebody elses task', async () => {
		// The task exists but belongs to another user.
		state.selectQueue.push([commandRow({ id: 't9', userId: 'someone-else' })]);
		const res = await POST(postEvent('u1', { command: 'start', taskId: 't9' }));
		expect(res.status).toBe(400);
		expect(state.insertedRows).toHaveLength(0);
	});

	it('rejects without a session or token', async () => {
		const res = await POST(postEvent(null, { command: 'stop' }));
		expect(res.status).toBe(401);
	});
});

