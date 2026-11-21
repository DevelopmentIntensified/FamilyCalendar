/**
 * tasks focus rules: the phone focus session time bounds, the
 * `focusStartedAt` field parser and the per-Task phone overlay.
 *
 * All three are module-internal: the interface exposes the session use-cases
 * and the overlay's result, never the math, so `index.ts` does not re-export
 * them. Nothing here reads the clock — `now` is a parameter (rule R5).
 *
 * Doc: ./README.md#invariants
 */

/** A start may be at most this far ahead of the server clock (phone skew). */
export const MAX_START_SKEW_MS = 5 * 60 * 1000;

/** A finished session may last at most this long. */
export const MAX_SESSION_MS = 12 * 60 * 60 * 1000;

/** `GET ?unabsorbed=1` page size. */
export const UNABSORBED_LIMIT = 200;

/** A queued device command older than this never reaches the desktop (dropped on read). */
export const FOCUS_COMMAND_MAX_AGE_MS = 10 * 60 * 1000;

/** Commands one read answers — the legacy `MAX_COMMANDS` (Q-057 keeps the cap). */
export const FOCUS_COMMAND_PAGE_SIZE = 25;

/**
 * `endedAt > startedAt` and the span is at most 12 hours (inclusive at the
 * bound), in the legacy order: an at-or-before end never reports the length.
 */
export function sessionDurationError(startedAt: Date, endedAt: Date): string | null {
	const ms = endedAt.getTime() - startedAt.getTime();
	if (ms <= 0) return 'endedAt must be after startedAt';
	if (ms > MAX_SESSION_MS) return 'Session is longer than 12 hours';
	return null;
}

/**
 * The contract's time rules: start ≤ now + 5 minutes (inclusive), and when
 * ended, the same duration rules as a stop. Returns the error copy or null.
 */
export function sessionTimesError(
	startedAt: Date,
	endedAt: Date | null,
	now: Date
): string | null {
	if (startedAt.getTime() > now.getTime() + MAX_START_SKEW_MS) {
		return 'startedAt is more than 5 minutes in the future';
	}
	return endedAt ? sessionDurationError(startedAt, endedAt) : null;
}

/** What the `focusStartedAt` field means: absent, cleared, or a real instant. */
export type TaskFocusStartedAtParse =
	| { readonly ok: true; readonly value: Date | null | undefined }
	| { readonly ok: false };

/**
 * The `focusStartedAt` rule shared by POST and PUT (legacy
 * `utils/focusStartedAt.ts:11-21`). Unlike `focusMinutes`, an explicit null is
 * a value: absent/undefined means "unchanged", null means "stopped" (clear),
 * a `Date.parse`-able string overwrites, and anything else is invalid.
 */
export function focusStartedAtValue(raw: unknown): TaskFocusStartedAtParse {
	if (raw === undefined) return { ok: true, value: undefined };
	if (raw === null) return { ok: true, value: null };
	if (typeof raw !== 'string') return { ok: false };
	const ms = Date.parse(raw);
	return Number.isNaN(ms) ? { ok: false } : { ok: true, value: new Date(ms) };
}

/** One phone session as the overlay reads it (the store's unabsorbed rows). */
export type TaskPhoneFocusRow = {
	readonly taskId: string;
	readonly startedAt: Date;
	readonly endedAt: Date | null;
	readonly absorbedAt: Date | null;
};

/** The two fields a Task row gains from the caller's phone sessions. */
export type TaskPhoneFocus = {
	readonly phoneFocusMinutes: number;
	readonly phoneFocusStartedAt: Date | null;
};

/**
 * Per-Task overlay from the caller's UNABSORBED rows: closed sessions SUM into
 * whole minutes and the total is floored once (two 90 s sessions are 3 min,
 * not 2); an open session contributes its start and no minutes yet. Absorbed
 * rows are ignored defensively even though the store filters them.
 */
export function summarizePhoneFocus(
	rows: readonly TaskPhoneFocusRow[]
): Map<string, TaskPhoneFocus> {
	const ms = new Map<string, number>();
	const open = new Map<string, Date>();
	for (const row of rows) {
		if (row.absorbedAt) continue;
		if (row.endedAt) {
			const duration = Math.max(0, row.endedAt.getTime() - row.startedAt.getTime());
			ms.set(row.taskId, (ms.get(row.taskId) ?? 0) + duration);
		} else {
			const previous = open.get(row.taskId);
			if (!previous || row.startedAt < previous) open.set(row.taskId, row.startedAt);
		}
	}
	const out = new Map<string, TaskPhoneFocus>();
	for (const taskId of new Set([...ms.keys(), ...open.keys()])) {
		out.set(taskId, {
			phoneFocusMinutes: Math.floor((ms.get(taskId) ?? 0) / 60000),
			phoneFocusStartedAt: open.get(taskId) ?? null
		});
	}
	return out;
}
