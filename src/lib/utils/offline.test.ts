import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	getPendingCount,
	getReplayDisposition,
	isOnline,
	queueMutation,
	replayPending,
	shouldDropAfterReplay,
	sortReplayQueue,
	subscribeToOnlineStatus,
	type MutationRecord
} from './offline';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

// --- Minimal in-memory fake for the exact IDB surface offline.ts uses ---
// offline.ts flow: indexedDB.open() -> request.onsuccess (db) ->
// db.transaction(store, mode) -> tx.objectStore(store) ->
// store.add/count/getAll/delete -> request.onsuccess + tx.oncomplete
interface FakeRow extends MutationRecord {
	id: number;
}

function installFakeIndexedDb(seed: FakeRow[] = []) {
	const rows: FakeRow[] = seed.map((r) => ({ ...r }));
	let nextId = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;

	const fakeIndexedDB = {
		open: () => {
			const req: Record<string, unknown> = {};
			queueMicrotask(() => {
				const db = {
					close: () => {},
					objectStoreNames: { contains: () => true },
					transaction: () => {
						const tx: Record<string, unknown> = {};
						const store = {
							add: (rec: Omit<FakeRow, 'id'>) => {
								const row = { ...rec, id: nextId++ } as FakeRow;
								rows.push(row);
								const r: Record<string, unknown> = { result: row.id };
								queueMicrotask(() => {
									(r.onsuccess as (() => void) | undefined)?.();
									(tx.oncomplete as (() => void) | undefined)?.();
								});
								return r;
							},
							count: () => {
								const r: Record<string, unknown> = { result: rows.length };
								queueMicrotask(() => {
									(r.onsuccess as (() => void) | undefined)?.();
									(tx.oncomplete as (() => void) | undefined)?.();
								});
								return r;
							},
							getAll: () => {
								const r: Record<string, unknown> = { result: [...rows] };
								queueMicrotask(() => {
									(r.onsuccess as (() => void) | undefined)?.();
									(tx.oncomplete as (() => void) | undefined)?.();
								});
								return r;
							},
							delete: (id: number) => {
								const idx = rows.findIndex((x) => x.id === id);
								if (idx >= 0) rows.splice(idx, 1);
								const r: Record<string, unknown> = { result: undefined };
								queueMicrotask(() => {
									(r.onsuccess as (() => void) | undefined)?.();
									(tx.oncomplete as (() => void) | undefined)?.();
								});
								return r;
							}
						};
						(tx as Record<string, unknown>).objectStore = () => store;
						return tx;
					}
				};
				req.result = db;
				(req.onsuccess as (() => void) | undefined)?.();
			});
			return req;
		}
	};

	vi.stubGlobal('window', {
		indexedDB: fakeIndexedDB,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn()
	});
	return {
		rows,
		get nextId() {
			return nextId;
		}
	};
}

function stubFetchWithStatuses(statuses: number[] | ((url: string) => number)) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fn = vi.fn(async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		const status =
			typeof statuses === 'function' ? statuses(url) : (statuses.shift() ?? 200);
		return new Response(null, { status });
	});
	vi.stubGlobal('fetch', fn);
	return { calls, fn };
}

describe('replay policy helpers (pure, node-safe)', () => {
	it('sortReplayQueue replays oldest-first by id', () => {
		const input: MutationRecord[] = [
			{ id: 3, url: '/c', method: 'POST', body: null, createdAt: 3 },
			{ id: 1, url: '/a', method: 'POST', body: null, createdAt: 1 },
			{ id: 2, url: '/b', method: 'POST', body: null, createdAt: 2 }
		];
		expect(sortReplayQueue(input).map((r) => r.id)).toEqual([1, 2, 3]);
	});

	it('sortReplayQueue does not mutate its input and treats missing id as 0', () => {
		const input: MutationRecord[] = [
			{ id: 2, url: '/b', method: 'POST', body: null, createdAt: 2 },
			{ url: '/noid', method: 'POST', body: null, createdAt: 0 }
		];
		const snapshot = [...input];
		const sorted = sortReplayQueue(input);
		expect(input).toEqual(snapshot);
		expect(sorted[0].url).toBe('/noid');
	});

	it('getReplayDisposition maps 2xx to applied', () => {
		for (const s of [200, 201, 204, 299]) expect(getReplayDisposition(s)).toBe('applied');
	});

	it('getReplayDisposition maps 4xx to discarded (drop, never retried)', () => {
		for (const s of [400, 404, 409, 422, 429, 499])
			expect(getReplayDisposition(s)).toBe('discarded');
	});

	it('getReplayDisposition maps anything else to retry (kept for later)', () => {
		for (const s of [199, 300, 301, 302, 399, 500, 502, 503, 599])
			expect(getReplayDisposition(s)).toBe('retry');
	});

	it('shouldDropAfterReplay is true for 2xx/4xx and false for retryable statuses', () => {
		expect(shouldDropAfterReplay(200)).toBe(true);
		expect(shouldDropAfterReplay(204)).toBe(true);
		expect(shouldDropAfterReplay(400)).toBe(true);
		expect(shouldDropAfterReplay(404)).toBe(true);
		expect(shouldDropAfterReplay(499)).toBe(true);
		expect(shouldDropAfterReplay(500)).toBe(false);
		expect(shouldDropAfterReplay(503)).toBe(false);
		expect(shouldDropAfterReplay(302)).toBe(false);
	});
});

describe('no-IndexedDB guards (node-safe import)', () => {
	it('queueMutation is a no-op, getPendingCount is 0, replayPending is empty', async () => {
		// No window stubbed here -> hasIndexedDb() is false in node.
		await expect(queueMutation('/api/tasks/1', 'PUT', { a: 1 })).resolves.toBeUndefined();
		await expect(getPendingCount()).resolves.toBe(0);
		await expect(replayPending()).resolves.toEqual({ applied: 0, failed: 0 });
	});

	it('isOnline returns true when navigator is undefined, else navigator.onLine', () => {
		vi.stubGlobal('navigator', undefined);
		expect(isOnline()).toBe(true);
		vi.stubGlobal('navigator', { onLine: false });
		expect(isOnline()).toBe(false);
		vi.stubGlobal('navigator', { onLine: true });
		expect(isOnline()).toBe(true);
	});
});

describe('queue persistence (full pipeline via fake IndexedDB)', () => {
	it('queueMutation persists url/method/body and getPendingCount reflects it', async () => {
		const db = installFakeIndexedDb();
		await queueMutation('/api/tasks/1', 'PUT', { toggleComplete: true });
		await queueMutation('/api/events', 'POST', { title: 'Party' });
		await expect(getPendingCount()).resolves.toBe(2);
		expect(db.rows).toHaveLength(2);
		expect(db.rows[0]).toMatchObject({ url: '/api/tasks/1', method: 'PUT' });
		expect(db.rows[0].createdAt).toEqual(expect.any(Number));
	});

	it('queueMutation preserves an explicit null body (e.g. DELETE completed)', async () => {
		const db = installFakeIndexedDb();
		await queueMutation('/api/tasks/completed', 'DELETE', null);
		expect(db.rows[0].body).toBeNull();
	});
});

describe('replay ordering', () => {
	it('replays oldest-first in fetch-call order', async () => {
		installFakeIndexedDb();
		await queueMutation('/api/a', 'POST', { n: 1 });
		await queueMutation('/api/b', 'POST', { n: 2 });
		await queueMutation('/api/c', 'POST', { n: 3 });
		const { calls } = stubFetchWithStatuses([200, 200, 200]);

		const result = await replayPending();

		expect(result).toEqual({ applied: 3, failed: 0 });
		expect(calls.map((c) => c.url)).toEqual(['/api/a', '/api/b', '/api/c']);
		await expect(getPendingCount()).resolves.toBe(0);
	});

	it('replays by id order even when the store returns rows shuffled', async () => {
		installFakeIndexedDb([
			{ id: 3, url: '/api/c', method: 'POST', body: null, createdAt: 3 },
			{ id: 1, url: '/api/a', method: 'POST', body: null, createdAt: 1 },
			{ id: 2, url: '/api/b', method: 'POST', body: null, createdAt: 2 }
		]);
		const { calls } = stubFetchWithStatuses([200, 200, 200]);

		await replayPending();

		expect(calls.map((c) => c.url)).toEqual(['/api/a', '/api/b', '/api/c']);
	});
});

describe('replay conflict semantics: 4xx-drop vs 5xx-retry', () => {
	it('2xx removes the record and counts applied', async () => {
		installFakeIndexedDb();
		await queueMutation('/api/tasks/1', 'PUT', { x: 1 });
		stubFetchWithStatuses([200]);

		await expect(replayPending()).resolves.toEqual({ applied: 1, failed: 0 });
		await expect(getPendingCount()).resolves.toBe(0);
	});

	it('4xx removes the record, counts failed, and is never retried', async () => {
		installFakeIndexedDb();
		await queueMutation('/api/tasks/1', 'PUT', { x: 1 });
		stubFetchWithStatuses([404]);

		await expect(replayPending()).resolves.toEqual({ applied: 0, failed: 1 });
		await expect(getPendingCount()).resolves.toBe(0);

		// Second replay finds nothing to retry.
		stubFetchWithStatuses([200]);
		await expect(replayPending()).resolves.toEqual({ applied: 0, failed: 0 });
	});

	it('5xx keeps the record for a later attempt', async () => {
		installFakeIndexedDb();
		await queueMutation('/api/tasks/1', 'PUT', { x: 1 });
		stubFetchWithStatuses([500]);

		await expect(replayPending()).resolves.toEqual({ applied: 0, failed: 1 });
		await expect(getPendingCount()).resolves.toBe(1);

		// Retry later succeeds.
		stubFetchWithStatuses([200]);
		await expect(replayPending()).resolves.toEqual({ applied: 1, failed: 0 });
		await expect(getPendingCount()).resolves.toBe(0);
	});

	it('network errors keep the record for a later attempt', async () => {
		installFakeIndexedDb();
		await queueMutation('/api/tasks/1', 'PUT', { x: 1 });
		vi.stubGlobal(
			'fetch',
			vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
		);

		await expect(replayPending()).resolves.toEqual({ applied: 0, failed: 1 });
		await expect(getPendingCount()).resolves.toBe(1);
	});

	it('mixed batch: 2xx applied, 4xx dropped, 5xx kept', async () => {
		installFakeIndexedDb();
		await queueMutation('/api/ok', 'POST', { n: 1 });
		await queueMutation('/api/gone', 'PUT', { n: 2 });
		await queueMutation('/api/broken', 'POST', { n: 3 });
		stubFetchWithStatuses([200, 404, 500]);

		await expect(replayPending()).resolves.toEqual({ applied: 1, failed: 2 });
		// Only the 5xx record survives.
		await expect(getPendingCount()).resolves.toBe(1);
	});
});

describe('replay wire format', () => {
	it('sends JSON content-type and stringified body when a body is present', async () => {
		installFakeIndexedDb();
		const payload = { toggleComplete: true };
		await queueMutation('/api/tasks/1', 'PUT', payload);
		const { calls } = stubFetchWithStatuses([200]);

		await replayPending();

		expect(calls).toHaveLength(1);
		expect(calls[0].init.method).toBe('PUT');
		expect(calls[0].init.headers).toEqual({ 'content-type': 'application/json' });
		expect(calls[0].init.body).toBe(JSON.stringify(payload));
	});

	it('sends no content-type/body when the queued body is null', async () => {
		installFakeIndexedDb();
		await queueMutation('/api/tasks/completed', 'DELETE', null);
		const { calls } = stubFetchWithStatuses([200]);

		await replayPending();

		expect(calls).toHaveLength(1);
		expect(calls[0].init.method).toBe('DELETE');
		expect(calls[0].init.headers).toBeUndefined();
		expect(calls[0].init.body).toBeUndefined();
	});
});

describe('online status subscription', () => {
	it('reflects navigator.onLine and calls back immediately', () => {
		vi.stubGlobal('navigator', { onLine: false });
		vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
		const cb = vi.fn();
		const unsub = subscribeToOnlineStatus(cb);
		expect(cb).toHaveBeenCalledWith(false);
		unsub();
	});
});
