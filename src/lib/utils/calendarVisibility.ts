/**
 * Per-calendar view filter (#069).
 *
 * Colour in the grid has always meant "this event's calendar", but there was
 * no way to act on it — a busy week could not be decluttered. This module is
 * the whole filter: which calendar ids are hidden, how that survives a reload,
 * and the one predicate every view reads.
 *
 * **A view filter, not a setting.** Hiding a calendar says "don't draw this
 * here". The default-calendar setting says "where do new events land". They
 * are disjoint: different keys, different writers, and hiding a calendar never
 * touches where a new event is created.
 *
 * Storage is per user, per device (localStorage) — the filter is a reading
 * preference for this screen, not account data, and it must not cost a
 * round trip on the calendar page load.
 */

export type CalendarRef = { id: string; name?: string; color?: string };

/** The slice of the Web Storage API this module needs. Null means unavailable
 *  (SSR, private browsing) and degrades to "nothing hidden". */
export interface KeyValueStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** Storage key — namespaced per user so two accounts on one device keep their
 *  own filter. Follows `familyplanz:tzProbed:<userId>`. */
export function hiddenCalendarKey(userId: string | null | undefined): string {
	return `familyplanz:hiddenCalendars:${userId || 'anon'}`;
}

/** Parse a stored payload. Anything unrecognised means "nothing hidden" —
 *  a corrupt value must never leave the grid permanently blank. */
export function parseHiddenCalendars(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const ids = parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
		return Array.from(new Set(ids));
	} catch {
		return [];
	}
}

export function serializeHiddenCalendars(ids: readonly string[]): string {
	return JSON.stringify(Array.from(new Set(ids)));
}

export function loadHiddenCalendars(
	storage: KeyValueStorage | null | undefined,
	userId: string | null | undefined
): string[] {
	if (!storage) return [];
	try {
		return parseHiddenCalendars(storage.getItem(hiddenCalendarKey(userId)));
	} catch {
		return [];
	}
}

/** Persist the filter. A storage that throws (private mode, quota) leaves the
 *  in-memory filter applied for this session rather than breaking the toggle. */
export function saveHiddenCalendars(
	storage: KeyValueStorage | null | undefined,
	userId: string | null | undefined,
	ids: readonly string[]
): void {
	if (!storage) return;
	try {
		storage.setItem(hiddenCalendarKey(userId), serializeHiddenCalendars(ids));
	} catch {
		/* session-only filter */
	}
}

export function isCalendarHidden(id: string | null | undefined, hidden: readonly string[]): boolean {
	// An empty id is an event on NO calendar (a sponsored ad). No calendar
	// toggle may reach it, so "hide all calendars" never hides an ad.
	if (!id) return false;
	return hidden.includes(id);
}

export function toggleCalendarVisibility(hidden: readonly string[], id: string): string[] {
	if (!id) return Array.from(hidden);
	return hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
}

export function allCalendarIds(calendars: readonly CalendarRef[]): string[] {
	return calendars.map((c) => c.id).filter((id) => id.length > 0);
}

/** Hide all / show all, in one tap each. */
export function setAllCalendarsHidden(
	calendars: readonly CalendarRef[],
	hide: boolean
): string[] {
	return hide ? allCalendarIds(calendars) : [];
}

/** The hidden calendars by name, for the empty state. Names for ids that no
 *  longer exist are skipped — a deleted calendar should not haunt the copy. */
export function hiddenCalendarNames(
	calendars: readonly CalendarRef[],
	hidden: readonly string[]
): string[] {
	return calendars.filter((c) => c.id && hidden.includes(c.id)).map((c) => c.name ?? c.id);
}

/**
 * The one predicate every view reads: drop rows whose calendar is hidden.
 * Applies identically to Events and to due Tasks — a Task is filtered by the
 * calendar it belongs to, so hiding a calendar takes its tasks with it.
 * Returns a new array; the input is never mutated.
 */
export function visibleByCalendar<T extends object>(
	rows: readonly T[],
	hidden: readonly string[]
): T[] {
	if (hidden.length === 0) return rows.slice();
	return rows.filter((row) => !isCalendarHidden(calendarIdOf(row), hidden));
}

/** A row's calendar id, tolerating one that carries no calendar field at all
 *  (a serialized or legacy row). Constraining the generic on
 *  `{ calendarId?: … }` would trip TypeScript's weak-type check and reject
 *  exactly the rows this must survive. */
function calendarIdOf(row: object): string | null | undefined {
	return (row as { calendarId?: string | null }).calendarId;
}
