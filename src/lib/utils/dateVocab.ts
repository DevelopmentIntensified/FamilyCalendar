/**
 * Shared client-safe NLP date/recurrence vocabulary.
 *
 * Single canonical source for month names, weekday names, recurrence unit
 * words, and `escapeRegExp` — consumed by both `taskQuickAdd.ts` (client,
 * native Date) and `dateParsing.ts` (server, Luxon DateTime).
 *
 * NO server-only imports, NO db, NO Luxon — pure data + small pure helpers.
 */

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

/** Full month names, 0-indexed (January = 0). */
export const MONTH_FULL: readonly string[] = [
	'january', 'february', 'march', 'april', 'may', 'june',
	'july', 'august', 'september', 'october', 'november', 'december'
];

/** Month abbreviation → 0-based index. */
export const MONTH_ABBREV_INDEX: Record<string, number> = {
	jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
	jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
};

/** Month full name → 0-based index. */
export const MONTH_FULL_INDEX: Record<string, number> = {};
for (let i = 0; i < 12; i++) {
	MONTH_FULL_INDEX[MONTH_FULL[i]] = i;
}

/** All month tokens → 0-based index (full + abbreviations). */
export const MONTH_INDEX_0: Record<string, number> = { ...MONTH_FULL_INDEX, ...MONTH_ABBREV_INDEX };

/** All month tokens → 1-based index (for Luxon / dateParsing). */
export const MONTH_INDEX_1: Record<string, number> = {};
for (const [k, v] of Object.entries(MONTH_INDEX_0)) {
	MONTH_INDEX_1[k] = v + 1;
}

/**
 * Regex-safe alternation of all month tokens, longest-first so
 * "september" wins over "sept"/"sep". Matches dateParsing.ts MONTH_ALT.
 */
export const MONTH_ALT =
	'january|february|september|december|november|october|august|april|march|june|july|may|sept|jan|feb|mar|apr|aug|sep|oct|nov|dec';

/**
 * Regex-safe alternation of month tokens for group capture.
 * Matches taskQuickAdd's MONTH_NAME: each month captured as a single group.
 * Month order does not affect correctness (each token is unique).
 */
export const MONTH_NAME_TOKEN =
	'(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)';

// ---------------------------------------------------------------------------
// Weekdays
// ---------------------------------------------------------------------------

/** Full weekday names, Sunday = 0 (matches JS Date.getDay()). */
export const WEEKDAY_FULL: readonly string[] = [
	'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
];

/** Short weekday tokens (used by taskQuickAdd for bare-weekday matching). */
export const WEEKDAY_SHORT: readonly string[] = [
	'sun', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat'
];

/** Regex-safe alternation of full weekday names (dateParsing DAY_ALT). */
export const DAY_ALT = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';

/**
 * Regex-safe non-capturing group of ALL weekday tokens (full + short).
 * Matches taskQuickAdd's WEEKDAY_TOKEN.
 */
export const WEEKDAY_TOKEN =
	'(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)';

// ---------------------------------------------------------------------------
// Recurrence units
// ---------------------------------------------------------------------------

/** Bare recurrence unit words used in "every N day/week/month/year" phrases. */
export const RECURRENCE_UNITS = 'day|week|month|year' as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape special regex characters in a string. */
export function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
