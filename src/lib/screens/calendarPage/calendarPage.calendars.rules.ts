/**
 * calendarPage calendar-filter rules: which calendars are hidden, the stored
 * shape `localPref` reads and writes, and the one predicate every view reads.
 *
 * A view filter, not a setting: hiding a calendar says "don't draw this here".
 * The default-calendar setting says "where do new events land". Disjoint keys,
 * disjoint writers — hiding never touches `defaultCalendarId`.
 *
 * Ported from legacy `src/lib/utils/calendarVisibility.ts` (#069); its
 * `KeyValueStorage` boilerplate dies into kernel `localPref`, so this file
 * exports only the key, the version and the value codec.
 *
 * Doc: ./README.md#the-reading-filters
 */
export interface CalendarFilterRef {
	id: string;
	name?: string;
	color?: string;
}

/** The `localPref` version; a different stored version reads as "nothing hidden". */
export const HIDDEN_CALENDARS_VERSION = 1;

/**
 * Storage key — namespaced per user so two accounts on one device keep their
 * own filter. Follows `familyplanz:tzProbed:<userId>`.
 */
export function hiddenCalendarsKey(userId: string | null | undefined): string {
	return `familyplanz:hiddenCalendars:${userId || 'anon'}`;
}

/**
 * Parse the stored value (`localPref` unwraps `{v, value}` first). Anything
 * unrecognised means "nothing hidden" — a corrupt value must never leave the
 * grid permanently blank.
 */
export function parseHiddenCalendars(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
	return Array.from(new Set(ids));
}

/** The value to store: unique, non-empty ids. `localPref` adds the wrapper. */
export function serialiseHiddenCalendars(ids: readonly string[]): string[] {
	return Array.from(new Set(ids.filter((id) => id.length > 0)));
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

/** Hide all / show all, in one tap each. */
export function setAllCalendarsHidden(calendars: readonly CalendarFilterRef[], hide: boolean): string[] {
	if (!hide) return [];
	return calendars.map((calendar) => calendar.id).filter((id) => id.length > 0);
}

/**
 * The hidden calendars by name, for the empty state. Names for ids that no
 * longer exist are skipped — a deleted calendar should not haunt the copy.
 */
export function hiddenCalendarNames(
	calendars: readonly CalendarFilterRef[],
	hidden: readonly string[]
): string[] {
	return calendars
		.filter((calendar) => calendar.id && hidden.includes(calendar.id))
		.map((calendar) => calendar.name ?? calendar.id);
}

/**
 * The one predicate every view reads: drop rows whose calendar is hidden.
 * Applies identically to Events and to due Tasks — a Task is filtered by the
 * calendar it belongs to, so hiding a calendar takes its tasks with it.
 * Returns a new array; the input is never mutated.
 *
 * A row with no `calendarId` field at all is a sponsored ad: it belongs to no
 * calendar toggle and survives every filter here.
 */
export function isVisibleByCalendar<T extends object>(
	rows: readonly T[],
	hidden: readonly string[]
): T[] {
	if (hidden.length === 0) return rows.slice();
	return rows.filter((row) => !isCalendarHidden(calendarIdOf(row), hidden));
}

/** A row's calendar id, tolerating one that carries no calendar field at all. */
function calendarIdOf(row: object): string | null | undefined {
	if (!('calendarId' in row)) return undefined;
	const value = row.calendarId;
	return typeof value === 'string' ? value : value === null ? null : undefined;
}
