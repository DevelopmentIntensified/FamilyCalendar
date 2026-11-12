/**
 * Typed, versioned device preference over an injectable `Storage` (folds the
 * `calendarVisibility` / `calendarAssignees` KeyValueStorage boilerplate). A
 * wrong version, junk JSON, a rejected value, SSR or a storage that refuses
 * access all fall back rather than throw (task K-07).
 *
 * Doc: src/lib/kernel/README.md#client
 */

type PrefStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface StoredPref {
	v?: unknown;
	value?: unknown;
}

export function localPref<T>(opts: {
	key: string;
	version: number;
	fallback: T;
	parse: (raw: unknown) => T | null;
	storage?: PrefStorage | null;
}): { read(): T; write(value: T): void; clear(): void } {
	const { key, version, fallback, parse } = opts;

	function storage(): PrefStorage | null {
		if (opts.storage !== undefined) return opts.storage;
		try {
			return typeof localStorage === 'undefined' ? null : localStorage;
		} catch {
			// Some browsers throw on the localStorage getter itself (blocked cookies).
			return null;
		}
	}

	function read(): T {
		try {
			const stored = storage()?.getItem(key);
			if (stored == null) return fallback;
			const raw: unknown = JSON.parse(stored);
			if (typeof raw !== 'object' || raw === null) return fallback;
			// SAFETY: `parse` is the only gate for the stored value; the wrapper
			// shape is ours and the version check below rejects anything else.
			const { v, value: storedValue } = raw as StoredPref;
			if (v !== version) return fallback;
			const value = parse(storedValue);
			return value === null ? fallback : value;
		} catch {
			return fallback;
		}
	}

	function write(value: T): void {
		try {
			storage()?.setItem(key, JSON.stringify({ v: version, value }));
		} catch {
			// A full or blocked storage must never break the interaction.
		}
	}

	function clear(): void {
		try {
			storage()?.removeItem(key);
		} catch {
			// Nothing to recover: the preference is simply still there.
		}
	}

	return { read, write, clear };
}
