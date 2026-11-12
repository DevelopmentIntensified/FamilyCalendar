/**
 * Offline mutation queue: writes that happened while the browser was offline
 * are kept in IndexedDB and replayed on the next connection, with an explicit
 * conflict policy (2xx drop, auth 4xx keep for re-auth, other 4xx drop, 5xx and
 * network errors keep). Moved from legacy `utils/offline.ts`; the browser
 * globals are injectable so the queue is tested without a DOM (task K-07).
 *
 * Doc: src/lib/kernel/README.md#client
 */
import { systemClock } from '../time/clock';

const DB_NAME = 'familyplanz-offline';
const DB_VERSION = 1;
const MUTATION_STORE = 'mutationQueue';

export interface MutationRecord {
	id?: number;
	url: string;
	method: string;
	body: unknown;
	createdAt: number;
}

/**
 * Explicit replay/conflict policy for the offline mutation queue.
 * Kept as pure, node-safe helpers so the rules are pinned by tests
 * independently of IndexedDB/fetch.
 */
export type ReplayDisposition = 'applied' | 'discarded' | 'retry';

/** The slice of `IDBRequest` the queue uses. */
export interface OfflineRequest<T> {
	onsuccess: (() => void) | null;
	result?: T;
}

/** The slice of `IDBOpenDBRequest` the queue uses. */
export interface OfflineOpenRequest extends OfflineRequest<OfflineDatabase> {
	onupgradeneeded: (() => void) | null;
	onerror: (() => void) | null;
	error: unknown;
}

/** The slice of `IDBObjectStore` the queue uses. */
export interface OfflineObjectStore {
	add(record: MutationRecord): OfflineRequest<unknown>;
	count(): OfflineRequest<number>;
	getAll(): OfflineRequest<MutationRecord[]>;
	delete(id: number): OfflineRequest<unknown>;
	createIndex(name: string, keyPath: string): void;
}

/** The slice of `IDBTransaction` the queue uses. */
export interface OfflineTransaction {
	objectStore(name: string): OfflineObjectStore;
	oncomplete: (() => void) | null;
	onerror: (() => void) | null;
	onabort: (() => void) | null;
	error: unknown;
}

/** The slice of `IDBDatabase` the queue uses. */
export interface OfflineDatabase {
	close(): void;
	objectStoreNames: { contains(name: string): boolean };
	createObjectStore(
		name: string,
		options: { keyPath: string; autoIncrement: boolean }
	): OfflineObjectStore;
	transaction(name: string, mode: 'readonly' | 'readwrite'): OfflineTransaction;
}

/** The slice of `IDBFactory` the queue uses; tests pass an in-memory fake. */
export interface OfflineDatabaseFactory {
	open(name: string, version: number): OfflineOpenRequest;
}

/** The slice of `window` the queue uses. */
export interface OfflineWindow {
	indexedDB?: OfflineDatabaseFactory | null;
	addEventListener(type: 'online' | 'offline', listener: () => void): void;
	removeEventListener(type: 'online' | 'offline', listener: () => void): void;
}

/** The browser globals the queue needs, injectable for tests and SSR. */
export interface OfflineQueueEnvironment {
	indexedDB?: OfflineDatabaseFactory | null;
	navigator?: Pick<Navigator, 'onLine'> | null;
	window?: OfflineWindow | null;
	fetch?: (input: string, init?: RequestInit) => Promise<Response>;
	/** Wall clock for `createdAt`; defaults to the kernel system clock (rule R5). */
	now?: () => number;
}

/** Oldest-first replay order (queue insertion order via auto-increment id). */
export function sortReplayQueue(records: MutationRecord[]): MutationRecord[] {
	return [...records].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

/**
 * Conflict semantics for one replayed mutation:
 * - 2xx `applied`: server accepted it.
 * - 4xx `discarded`: server rejected it permanently; dropping avoids
 *   retrying something that will never succeed (e.g. 404/409/422).
 * - 401/403 `retry`: AUTH failures, not rejections — the queued create is
 *   still valid and must survive until re-auth (next session) succeeds.
 *   Dropping them was permanent data loss for offline-created events.
 * - anything else (3xx/5xx) `retry`: keep the record for a later attempt.
 * Network throws are handled by the caller as `retry` (failed + kept).
 */
export function getReplayDisposition(status: number): ReplayDisposition {
	if (status >= 200 && status < 300) return 'applied';
	if (status === 401 || status === 403) return 'retry';
	if (status >= 400 && status < 500) return 'discarded';
	return 'retry';
}

/** True when the record must be removed after replay (2xx, or non-auth 4xx). */
export function shouldDropAfterReplay(status: number): boolean {
	return getReplayDisposition(status) !== 'retry';
}

function resolveWindow(env: OfflineQueueEnvironment): OfflineWindow | null {
	if (env.window !== undefined) return env.window;
	return typeof window === 'undefined' ? null : window;
}

function resolveIndexedDb(env: OfflineQueueEnvironment): OfflineDatabaseFactory | null {
	if (env.indexedDB !== undefined) return env.indexedDB;
	return resolveWindow(env)?.indexedDB ?? null;
}

function openDb(indexedDB: OfflineDatabaseFactory): Promise<OfflineDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db || db.objectStoreNames.contains(MUTATION_STORE)) return;
			const store = db.createObjectStore(MUTATION_STORE, { keyPath: 'id', autoIncrement: true });
			store.createIndex('createdAt', 'createdAt');
		};
		request.onsuccess = () => {
			const db = request.result;
			if (db) resolve(db);
			else reject(new Error('offline queue: IndexedDB opened without a database'));
		};
		request.onerror = () => reject(request.error);
	});
}

async function withStore<T>(
	indexedDB: OfflineDatabaseFactory,
	mode: 'readonly' | 'readwrite',
	fn: (store: OfflineObjectStore) => OfflineRequest<unknown> | void
): Promise<T> {
	const db = await openDb(indexedDB);
	return new Promise<T>((resolve, reject) => {
		const tx = db.transaction(MUTATION_STORE, mode);
		const store = tx.objectStore(MUTATION_STORE);
		let result: T | undefined;
		tx.oncomplete = () => {
			db.close();
			// SAFETY: oncomplete only fires after every request's onsuccess has
			// assigned `request.result` (a T) to `result`; the write paths store
			// nothing, so an undefined `result` here is the by-design void case.
			resolve(result as T);
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
		tx.onabort = () => {
			db.close();
			reject(tx.error);
		};
		const request = fn(store);
		if (request) {
			request.onsuccess = () => {
				result = request.result as T;
			};
		}
	});
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- I/O boundary: persists opaque request payloads to IndexedDB for offline replay; a concrete type would fake precision.
export async function queueMutation(
	url: string,
	method: string,
	body: unknown,
	env: OfflineQueueEnvironment = {}
): Promise<void> {
	const indexedDB = resolveIndexedDb(env);
	if (!indexedDB) return;
	const now = env.now ?? (() => systemClock.now().getTime());
	await withStore<void>(indexedDB, 'readwrite', (store) => {
		store.add({ url, method, body, createdAt: now() });
	});
}

export async function getPendingCount(env: OfflineQueueEnvironment = {}): Promise<number> {
	const indexedDB = resolveIndexedDb(env);
	if (!indexedDB) return 0;
	return withStore<number>(indexedDB, 'readonly', (store) => store.count());
}

async function getAllMutations(indexedDB: OfflineDatabaseFactory): Promise<MutationRecord[]> {
	return withStore<MutationRecord[]>(indexedDB, 'readonly', (store) => store.getAll());
}

async function deleteMutation(
	indexedDB: OfflineDatabaseFactory,
	id: number | undefined
): Promise<void> {
	if (id === undefined) return;
	await withStore<void>(indexedDB, 'readwrite', (store) => {
		store.delete(id);
	});
}

/**
 * Replays queued mutations oldest-first.
 * 2xx or non-auth-4xx responses remove the record (those never succeed on
 * retry). 401/403 and network errors / other statuses keep the record for a
 * later attempt (re-auth happens next session).
 */
export async function replayPending(
	env: OfflineQueueEnvironment = {}
): Promise<{ applied: number; failed: number }> {
	const indexedDB = resolveIndexedDb(env);
	if (!indexedDB) return { applied: 0, failed: 0 };

	const send = env.fetch ?? fetch;
	const records = sortReplayQueue(await getAllMutations(indexedDB));

	let applied = 0;
	let failed = 0;

	for (const record of records) {
		try {
			const hasBody = record.body !== null && record.body !== undefined;
			const response = await send(record.url, {
				method: record.method,
				headers: hasBody ? { 'content-type': 'application/json' } : undefined,
				body: hasBody ? JSON.stringify(record.body) : undefined
			});

			const disposition = getReplayDisposition(response.status);
			if (shouldDropAfterReplay(response.status)) {
				await deleteMutation(indexedDB, record.id);
				if (disposition === 'applied') {
					applied++;
				} else {
					failed++;
				}
			} else {
				failed++;
			}
		} catch {
			failed++;
		}
	}

	return { applied, failed };
}

export function isOnline(env: OfflineQueueEnvironment = {}): boolean {
	const nav: Pick<Navigator, 'onLine'> | null =
		env.navigator !== undefined
			? env.navigator
			: typeof navigator === 'undefined'
				? null
				: navigator;
	return nav ? nav.onLine : true;
}

type OnlineStatusCallback = (online: boolean) => void;

const statusListeners = new Set<OnlineStatusCallback>();
let removeWindowListeners: (() => void) | null = null;

/** Calls cb immediately with the current status, then on every online/offline change. Returns unsubscribe. */
export function subscribeToOnlineStatus(
	cb: OnlineStatusCallback,
	env: OfflineQueueEnvironment = {}
): () => void {
	const target = resolveWindow(env);
	if (!statusListeners.size && target) {
		const handleChange = () => {
			const online = isOnline(env);
			for (const listener of statusListeners) listener(online);
		};
		target.addEventListener('online', handleChange);
		target.addEventListener('offline', handleChange);
		removeWindowListeners = () => {
			target.removeEventListener('online', handleChange);
			target.removeEventListener('offline', handleChange);
		};
	}
	statusListeners.add(cb);
	cb(isOnline(env));
	return () => {
		statusListeners.delete(cb);
		if (!statusListeners.size) {
			removeWindowListeners?.();
			removeWindowListeners = null;
		}
	};
}

let syncInitialized = false;

/**
 * Registers a single 'online' listener that replays the mutation queue,
 * plus an initial attempt on startup (covers mutations queued while the
 * tab stayed open through a flaky connection). onChange fires after each
 * replay so UI can refresh pending counts. Returns a cleanup function.
 */
export function initOfflineSync(
	onChange?: () => void,
	env: OfflineQueueEnvironment = {}
): () => void {
	const target = resolveWindow(env);
	if (!target) return () => {};

	const sync = () =>
		replayPending(env)
			.catch(() => ({ applied: 0, failed: 0 }))
			.then(() => onChange?.());

	if (!syncInitialized) {
		syncInitialized = true;
		target.addEventListener('online', sync);
		sync();
	} else {
		sync();
	}

	return () => {};
}
