/**
 * shell timezone state: the once-per-user zone probe (#041).
 *
 * The legacy layout fired a `PATCH /api/me/settings` + `invalidateAll()` on
 * every mount while settings still said `'UTC'`, gated by a localStorage flag
 * it wrote BEFORE the request — so a failed save was never retried
 * (`(calendar)/calendar/+layout.svelte:17-49`). This class writes the flag only
 * after the save resolves, and reports "saved" so the frame refreshes the group
 * scope instead of the whole page.
 *
 * `storage` and `resolveZone` are constructor inputs: the frame passes
 * `localStorage` and `Intl.DateTimeFormat().resolvedOptions().timeZone`, a test
 * passes fakes (one of which throws, as a locked-down browser's storage does).
 *
 * Doc: ./README.md#invariants
 */
import type { ShellTimezonePort } from './shell.contract';

/** The once-per-user gate's key, unchanged from the legacy layout. */
const PROBE_KEY_PREFIX = 'familyplanz:tzProbed:';

/** The settings default the probe exists to replace. */
const DEFAULT_ZONE = 'UTC';

/** `localStorage` narrowed to what this class uses. */
export type ShellZoneStorage = {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
};

export type ShellTimezoneDeps = {
	readonly userId: string;
	readonly storage: ShellZoneStorage | null;
	/** The browser's IANA zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`). */
	readonly resolveZone: () => string | null | undefined;
};

export class ShellTimezoneState {
	private readonly port: ShellTimezonePort;
	private readonly deps: ShellTimezoneDeps;

	constructor(port: ShellTimezonePort, deps: ShellTimezoneDeps) {
		this.port = port;
		this.deps = deps;
	}

	/**
	 * Save the browser's zone when the stored one is still `'UTC'` and this user
	 * has not been probed in this browser. Answers true when a save happened, so
	 * the frame knows to refresh its scope.
	 */
	async probe(storedZone: string | null | undefined): Promise<boolean> {
		if (storedZone !== DEFAULT_ZONE) return false;
		const key = `${PROBE_KEY_PREFIX}${this.deps.userId}`;
		if (this.#flag(key)) return false;
		const zone = this.deps.resolveZone();
		if (!zone || zone === DEFAULT_ZONE) return false;
		try {
			await this.port.save(zone);
		} catch {
			// No flag: the next mount retries (the legacy code never did).
			return false;
		}
		this.#setFlag(key);
		return true;
	}

	/** The stored flag; a storage that throws reads as "not probed". */
	#flag(key: string): boolean {
		try {
			const stored = this.deps.storage?.getItem(key);
			return stored !== null && stored !== undefined;
		} catch {
			return false;
		}
	}

	/** Best-effort write: a locked-down storage must not undo a successful save. */
	#setFlag(key: string): void {
		try {
			this.deps.storage?.setItem(key, '1');
		} catch {
			/* retry next mount is harmless */
		}
	}
}
