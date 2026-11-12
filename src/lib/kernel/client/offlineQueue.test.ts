import { describe, it, expect } from 'vitest';
import {
	getPendingCount,
	getReplayDisposition,
	isOnline,
	queueMutation,
	replayPending,
	shouldDropAfterReplay,
	sortReplayQueue,
	subscribeToOnlineStatus,
	type MutationRecord,
	type OfflineDatabase,
	type OfflineDatabaseFactory,
	type OfflineObjectStore,
	type OfflineQueueEnvironment,
	type OfflineRequest,
	type OfflineTransaction
} from './offlineQueue';

interface FakeRow extends MutationRecord {
	id: number;
}

/** An IDB request the fake completes on a microtask, like the real one. */
interface FakeRequest<T> extends OfflineRequest<T> {
	onupgradeneeded: (() => void) | null;
	onerror: (() => void) | null;
	error: unknown;
}

// --- Minimal in-memory fake for the exact IDB surface offlineQueue.ts uses ---
// flow: indexedDB.open() -> request.onsuccess (db) ->
// db.transaction(store, mode) -> tx.objectStore(store) ->
// store.add/count/getAll/delete -> request.onsuccess + tx.oncomplete
function fakeIndexedDb(seed: FakeRow[] = []) {
	const rows: FakeRow[] = seed.map((row) => ({ ...row }));
	let nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

	function request<T>(result?: T): FakeRequest<T> {
		return { onsuccess: null, onupgradeneeded: null, onerror: null, error: null, result };
	}

	const database: OfflineDatabase = {
		close: () => {},
		objectStoreNames: { contains: () => true },
		createObjectStore: () => {
			throw new Error('the fake store already exists');
		},
		transaction: () => {
			const tx: OfflineTransaction = {
				objectStore: () => store,
				oncomplete: null,
				onerror: null,
				onabort: null,
				error: null
			};
			const finish = (completed: FakeRequest<unknown>) => {
				queueMicrotask(() => {
					completed.onsuccess?.(new Event('success'));
					tx.oncomplete?.(new Event('complete'));
				});
			};
			const store: OfflineObjectStore = {
				add: (record) => {
					const added = request<unknown>();
					rows.push({ ...record, id: nextId++ });
					finish(added);
					return added;
				},
				count: () => {
					const counted = request<number>(rows.length);
					finish(counted);
					return counted;
				},
				getAll: () => {
					const all = request<MutationRecord[]>([...rows]);
					finish(all);
					return all;
				},
				delete: (id) => {
					const index = rows.findIndex((row) => row.id === id);
					if (index >= 0) rows.splice(index, 1);
					const removed = request<unknown>();
					finish(removed);
					return removed;
				},
				createIndex: () => {}
			};
			return tx;
		}
	};

	const factory: OfflineDatabaseFactory = {
		open: () => {
			const opened = request<OfflineDatabase>();
			queueMicrotask(() => {
				opened.result = database;
				opened.onsuccess?.(new Event('success'));
			});
			return opened;
		}
	};

	return { factory, rows };
}

function fakeFetch(statuses: number[] | ((url: string) => number)) {
	const calls: { url: string; init?: RequestInit }[] = [];
	const queue = Array.isArray(statuses) ? [...statuses] : [];
	return {
		calls,
		fetch: async (url: string, init?: RequestInit) => {
			calls.push({ url, init });
			const status = typeof statuses === 'function' ? statuses(url) : (queue.shift() ?? 200);
			return new Response(null, { status });
		}
	};
}

/** The injected environment; `now` is fixed so `createdAt` is pinned. */
function env(overrides: Partial<OfflineQueueEnvironment> = {}): OfflineQueueEnvironment {
	return { now: () => 1_000, ...overrides };
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

	it('getReplayDisposition treats 401/403 as retry (auth failure, not permanent)', () => {
		// Dropping queued creates on 401/403 was permanent data loss: the
		// mutation is still valid, the session just needs re-auth.
		expect(getReplayDisposition(401)).toBe('retry');
		expect(getReplayDisposition(403)).toBe('retry');
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

	it('shouldDropAfterReplay keeps 401/403 queued for a later attempt', () => {
		expect(shouldDropAfterReplay(401)).toBe(false);
		expect(shouldDropAfterReplay(403)).toBe(false);
	});
});

describe('no-IndexedDB guards (node-safe import)', () => {
	it('queueMutation is a no-op, getPendingCount is 0, replayPending is empty', async () => {
		// No IndexedDB injected or present in node -> the queue stays inert.
		const bare = env({ indexedDB: null });
		await expect(queueMutation('/api/tasks/1', 'PUT', { a: 1 }, bare)).resolves.toBeUndefined();
		await expect(getPendingCount(bare)).resolves.toBe(0);
		await expect(replayPending(bare)).resolves.toEqual({ applied: 0, failed: 0 });
	});

	it('isOnline returns true when navigator is undefined, else navigator.onLine', () => {
		expect(isOnline({ navigator: null })).toBe(true);
		expect(isOnline({ navigator: { onLine: false } })).toBe(false);
		expect(isOnline({ navigator: { onLine: true } })).toBe(true);
	});
});

describe('queue persistence (full pipeline via fake IndexedDB)', () => {
	it('queueMutation persists url/method/body and getPendingCount reflects it', async () => {
		const db = fakeIndexedDb();
		const environment = env({ indexedDB: db.factory });

		await queueMutation('/api/tasks/1', 'PUT', { toggleComplete: true }, environment);
		await queueMutation('/api/events', 'POST', { title: 'Party' }, environment);

		await expect(getPendingCount(environment)).resolves.toBe(2);
		expect(db.rows).toHaveLength(2);
		expect(db.rows[0]).toMatchObject({ url: '/api/tasks/1', method: 'PUT' });
		expect(db.rows[0].createdAt).toBe(1_000);
	});

	it('queueMutation preserves an explicit null body (e.g. DELETE completed)', async () => {
		const db = fakeIndexedDb();

		await queueMutation(
			'/api/tasks/completed',
			'DELETE',
			null,
			env({ indexedDB: db.factory })
		);

		expect(db.rows[0].body).toBeNull();
	});
});

describe('replay ordering', () => {
	it('replays oldest-first in fetch-call order', async () => {
		const db = fakeIndexedDb();
		const environment = env({ indexedDB: db.factory });
		await queueMutation('/api/a', 'POST', { n: 1 }, environment);
		await queueMutation('/api/b', 'POST', { n: 2 }, environment);
		await queueMutation('/api/c', 'POST', { n: 3 }, environment);
		const network = fakeFetch([200, 200, 200]);

		const result = await replayPending({ ...environment, fetch: network.fetch });

		expect(result).toEqual({ applied: 3, failed: 0 });
		expect(network.calls.map((c) => c.url)).toEqual(['/api/a', '/api/b', '/api/c']);
		await expect(getPendingCount(environment)).resolves.toBe(0);
	});

	it('replays by id order even when the store returns rows shuffled', async () => {
		const db = fakeIndexedDb([
			{ id: 3, url: '/api/c', method: 'POST', body: null, createdAt: 3 },
			{ id: 1, url: '/api/a', method: 'POST', body: null, createdAt: 1 },
			{ id: 2, url: '/api/b', method: 'POST', body: null, createdAt: 2 }
		]);
		const network = fakeFetch([200, 200, 200]);

		await replayPending({ indexedDB: db.factory, fetch: network.fetch });

		expect(network.calls.map((c) => c.url)).toEqual(['/api/a', '/api/b', '/api/c']);
	});
});

describe('replay conflict semantics: 4xx-drop vs 5xx-retry', () => {
	it('2xx removes the record and counts applied', async () => {
		const db = fakeIndexedDb();
		const environment = env({ indexedDB: db.factory });
		await queueMutation('/api/tasks/1', 'PUT', { x: 1 }, environment);
		const network = fakeFetch([200]);

		await expect(replayPending({ ...environment, fetch: network.fetch })).resolves.toEqual({
			applied: 1,
			failed: 0
		});
		await expect(getPendingCount(environment)).resolves.toBe(0);
	});

	it('4xx removes the record, counts failed, and is never retried', async () => {
		const db = fakeIndexedDb();
		const environment = env({ indexedDB: db.factory });
		await queueMutation('/api/tasks/1', 'PUT', { x: 1 }, environment);
		const network = fakeFetch([404]);

		await expect(replayPending({ ...environment, fetch: network.fetch })).resolves.toEqual({
			applied: 0,
			failed: 1
		});
		await expect(getPendingCount(environment)).resolves.toBe(0);

		// Second replay finds nothing to retry.
		const later = fakeFetch([200]);
		await expect(replayPending({ ...environment, fetch: later.fetch })).resolves.toEqual({
			applied: 0,
			failed: 0
		});
	});

	it('5xx keeps the record for a later attempt', async () => {
		const db = fakeIndexedDb();
		const environment = env({ indexedDB: db.factory });
		await queueMutation('/api/tasks/1', 'PUT', { x: 1 }, environment);
		const network = fakeFetch([500]);

		await expect(replayPending({ ...environment, fetch: network.fetch })).resolves.toEqual({
			applied: 0,
			failed: 1
		});
		await expect(getPendingCount(environment)).resolves.toBe(1);

		// Retry later succeeds.
		const later = fakeFetch([200]);
		await expect(replayPending({ ...environment, fetch: later.fetch })).resolves.toEqual({
			applied: 1,
			failed: 0
		});
		await expect(getPendingCount(environment)).resolves.toBe(0);
	});

	it('network errors keep the record for a later attempt', async () => {
		const db = fakeIndexedDb();
		const environment = env({ indexedDB: db.factory });
		await queueMutation('/api/tasks/1', 'PUT', { x: 1 }, environment);
		const offline = {
			fetch: async (): Promise<Response> => {
				throw new TypeError('Failed to fetch');
			}
		};

		await expect(replayPending({ ...environment, ...offline })).resolves.toEqual({
			applied: 0,
			failed: 1
		});
		await expect(getPendingCount(environment)).resolves.toBe(1);
	});

	it('mixed batch: 2xx applied, 4xx dropped, 5xx kept', async () => {
		const db = fakeIndexedDb();
		const environment = env({ indexedDB: db.factory });
		await queueMutation('/api/ok', 'POST', { n: 1 }, environment);
		await queueMutation('/api/gone', 'PUT', { n: 2 }, environment);
		await queueMutation('/api/broken', 'POST', { n: 3 }, environment);
		const network = fakeFetch([200, 404, 500]);

		await expect(replayPending({ ...environment, fetch: network.fetch })).resolves.toEqual({
			applied: 1,
			failed: 2
		});
		// Only the 5xx record survives.
		await expect(getPendingCount(environment)).resolves.toBe(1);
	});

	it('401 keeps a queued create for a later attempt (re-auth, then replay)', async () => {
		const db = fakeIndexedDb();
		const environment = env({ indexedDB: db.factory });
		await queueMutation('/api/events', 'POST', { title: 'Party' }, environment);
		const network = fakeFetch([401]);

		await expect(replayPending({ ...environment, fetch: network.fetch })).resolves.toEqual({
			applied: 0,
			failed: 1
		});
		await expect(getPendingCount(environment)).resolves.toBe(1);

		// After re-auth the same record applies.
		const later = fakeFetch([200]);
		await expect(replayPending({ ...environment, fetch: later.fetch })).resolves.toEqual({
			applied: 1,
			failed: 0
		});
		await expect(getPendingCount(environment)).resolves.toBe(0);
	});

	it('403 keeps the record queued like 401', async () => {
		const db = fakeIndexedDb();
		const environment = env({ indexedDB: db.factory });
		await queueMutation('/api/events', 'POST', { title: 'Party' }, environment);
		const network = fakeFetch([403]);

		await expect(replayPending({ ...environment, fetch: network.fetch })).resolves.toEqual({
			applied: 0,
			failed: 1
		});
		await expect(getPendingCount(environment)).resolves.toBe(1);
	});
});

describe('replay wire format', () => {
	it('sends JSON content-type and stringified body when a body is present', async () => {
		const db = fakeIndexedDb();
		const environment = env({ indexedDB: db.factory });
		const payload = { toggleComplete: true };
		await queueMutation('/api/tasks/1', 'PUT', payload, environment);
		const network = fakeFetch([200]);

		await replayPending({ ...environment, fetch: network.fetch });

		expect(network.calls).toHaveLength(1);
		expect(network.calls[0].init?.method).toBe('PUT');
		expect(network.calls[0].init?.headers).toEqual({ 'content-type': 'application/json' });
		expect(network.calls[0].init?.body).toBe(JSON.stringify(payload));
	});

	it('sends no content-type/body when the queued body is null', async () => {
		const db = fakeIndexedDb();
		const environment = env({ indexedDB: db.factory });
		await queueMutation('/api/tasks/completed', 'DELETE', null, environment);
		const network = fakeFetch([200]);

		await replayPending({ ...environment, fetch: network.fetch });

		expect(network.calls).toHaveLength(1);
		expect(network.calls[0].init?.method).toBe('DELETE');
		expect(network.calls[0].init?.headers).toBeUndefined();
		expect(network.calls[0].init?.body).toBeUndefined();
	});
});

describe('online status subscription', () => {
	it('reflects navigator.onLine and calls back immediately', () => {
		const listeners: Record<string, () => void> = {};
		const window = {
			addEventListener: (type: 'online' | 'offline', listener: () => void) => {
				listeners[type] = listener;
			},
			removeEventListener: (type: 'online' | 'offline') => {
				delete listeners[type];
			}
		};
		const navigator = { onLine: false };
		const seen: boolean[] = [];

		const unsubscribe = subscribeToOnlineStatus((online) => seen.push(online), {
			navigator,
			window
		});

		expect(seen).toEqual([false]);

		navigator.onLine = true;
		listeners.online();
		expect(seen).toEqual([false, true]);

		unsubscribe();
		expect(listeners.online).toBeUndefined();
	});
});
