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

/** Oldest-first replay order (queue insertion order via auto-increment id). */
export function sortReplayQueue(records: MutationRecord[]): MutationRecord[] {
	return [...records].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

/**
 * Conflict semantics for one replayed mutation:
 * - 2xx `applied`: server accepted it.
 * - 4xx `discarded`: server rejected it permanently; dropping avoids
 *   retrying something that will never succeed (e.g. 404/409/422).
 * - anything else (3xx/5xx) `retry`: keep the record for a later attempt.
 * Network throws are handled by the caller as `retry` (failed + kept).
 */
export function getReplayDisposition(status: number): ReplayDisposition {
	if (status >= 200 && status < 300) return 'applied';
	if (status >= 400 && status < 500) return 'discarded';
	return 'retry';
}

/** True when the record must be removed after replay (2xx or 4xx). */
export function shouldDropAfterReplay(status: number): boolean {
	return getReplayDisposition(status) !== 'retry';
}

function hasIndexedDb(): boolean {
	return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = window.indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(MUTATION_STORE)) {
				const store = db.createObjectStore(MUTATION_STORE, { keyPath: 'id', autoIncrement: true });
				store.createIndex('createdAt', 'createdAt');
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function withStore<T>(
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore) => IDBRequest | void
): Promise<T> {
	const db = await openDb();
	return new Promise<T>((resolve, reject) => {
		const tx = db.transaction(MUTATION_STORE, mode);
		const store = tx.objectStore(MUTATION_STORE);
		let result: T | undefined;
		tx.oncomplete = () => {
			db.close();
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
				result = request.result;
			};
		}
	});
}

export async function queueMutation(url: string, method: string, body: unknown): Promise<void> {
	if (!hasIndexedDb()) return;
	await withStore<void>('readwrite', (store) => {
		store.add({ url, method, body, createdAt: Date.now() } satisfies MutationRecord);
	});
}

export async function getPendingCount(): Promise<number> {
	if (!hasIndexedDb()) return 0;
	return withStore<number>('readonly', (store) => store.count());
}

async function getAllMutations(): Promise<MutationRecord[]> {
	return withStore<MutationRecord[]>('readonly', (store) => store.getAll());
}

async function deleteMutation(id: number | undefined): Promise<void> {
	if (!hasIndexedDb() || id === undefined) return;
	await withStore<void>('readwrite', (store) => {
		store.delete(id);
	});
}

/**
 * Replays queued mutations oldest-first.
 * 2xx or 4xx responses remove the record (4xx will never succeed on retry).
 * Network errors and other statuses keep the record for a later attempt.
 */
export async function replayPending(): Promise<{ applied: number; failed: number }> {
	if (!hasIndexedDb()) return { applied: 0, failed: 0 };

	const records = sortReplayQueue(await getAllMutations());

	let applied = 0;
	let failed = 0;

	for (const record of records) {
		try {
			const hasBody = record.body !== null && record.body !== undefined;
			const response = await fetch(record.url, {
				method: record.method,
				headers: hasBody ? { 'content-type': 'application/json' } : undefined,
				body: hasBody ? JSON.stringify(record.body) : undefined
			});

			const disposition = getReplayDisposition(response.status);
			if (shouldDropAfterReplay(response.status)) {
				await deleteMutation(record.id);
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

export function isOnline(): boolean {
	if (typeof navigator === 'undefined') return true;
	return navigator.onLine;
}

type OnlineStatusCallback = (online: boolean) => void;

const statusListeners = new Set<OnlineStatusCallback>();

function handleOnlineChange() {
	const online = isOnline();
	for (const listener of statusListeners) {
		listener(online);
	}
}

/** Calls cb immediately with the current status, then on every online/offline change. Returns unsubscribe. */
export function subscribeToOnlineStatus(cb: OnlineStatusCallback): () => void {
	if (!statusListeners.size && typeof window !== 'undefined') {
		window.addEventListener('online', handleOnlineChange);
		window.addEventListener('offline', handleOnlineChange);
	}
	statusListeners.add(cb);
	cb(isOnline());
	return () => {
		statusListeners.delete(cb);
		if (!statusListeners.size && typeof window !== 'undefined') {
			window.removeEventListener('online', handleOnlineChange);
			window.removeEventListener('offline', handleOnlineChange);
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
export function initOfflineSync(onChange?: () => void): () => void {
	if (typeof window === 'undefined') return () => {};

	const sync = () =>
		replayPending()
			.catch(() => ({ applied: 0, failed: 0 }))
			.then(() => onChange?.());

	if (!syncInitialized) {
		syncInitialized = true;
		window.addEventListener('online', sync);
		sync();
	} else {
		sync();
	}

	return () => {};
}
