/**
 * Dates and times: the one home for formatting, day keys, day grouping and
 * month arithmetic. Each shape here was copied into several legacy files
 * (`dateUtils.formatDate`, `eventTime.formatEventTime`, `taskDisplay.formatDue*`,
 * `taskFeedback.shortDate`, the admin export `humanDate`/`isoDate`,
 * `TopPrioritiesCard.dueLabel`, `EditTaskDialog.toInputDate`, `groupByDateKey`
 * ×2, `eventTimes.toDateTime`, `recurrenceService.parseTimestamp`, the ICS
 * preview `isoOrNull`, `taskStats.toIsoTimestamp`, `familyActivity.toIso`);
 * modules import these instead of growing another formatter.
 *
 * Every function takes the IANA zone explicitly, plus `now` when the output is
 * relative, so nothing here reads the clock (rule R5) and tests pin any zone.
 *
 * One rule parses every string, for every function here (formatters and
 * `toInstantString` alike):
 * - `yyyy-MM-dd` is that calendar day in the zone (its local midnight);
 * - a date-time WITHOUT an offset is a UTC instant — Postgres `timestamp`
 *   without time zone stores UTC — then converted into the zone;
 * - a date-time WITH an offset keeps it, then converts into the zone.
 *
 * Doc: src/lib/kernel/README.md#time
 */
import { DateTime, IANAZone } from 'luxon';
import { isoDate } from '../validation/validators';

// Formatting must not depend on the host locale: tests and servers pin English.
const LOCALE = 'en-US';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The four recurrence storage words a cadence collapses onto. */
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * The value as a luxon DateTime in `zone`, by the one offset rule in the file
 * header. A `Date` is already an instant, so it only changes zone. Null for
 * empty/invalid input or an unknown zone.
 */
function parseInstant(value: Date | string | null | undefined, zone: string): DateTime | null {
	if (!IANAZone.isValidZone(zone)) return null;
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return null;
		return DateTime.fromJSDate(value, { zone }).setLocale(LOCALE);
	}
	if (typeof value !== 'string') return null;
	// Postgres hands out `YYYY-MM-DD HH:MM:SS`; luxon's ISO parser wants `T`.
	const text = value.trim().replace(' ', 'T');
	if (!text) return null;
	// Date-only means that calendar day in the zone; a date-time is parsed as
	// UTC (or by its own offset) and only then converted into the zone.
	const parsed = DATE_ONLY.test(text)
		? DateTime.fromISO(text, { zone, locale: LOCALE })
		: DateTime.fromISO(text, { zone: 'utc', locale: LOCALE }).setZone(zone);
	return parsed.isValid ? parsed : null;
}

/** The date in one of two shapes, taking the year-bearing one when it differs from `now`'s. */
function formatWithYear(
	dt: DateTime,
	nowYear: number | undefined,
	withoutYear: string,
	withYear: string
): string {
	return nowYear !== undefined && dt.year !== nowYear
		? dt.toFormat(withYear)
		: dt.toFormat(withoutYear);
}

/** `MM-dd-yyyy`, e.g. `11-11-2026` (legacy `dateUtils.formatDate`). `''` when empty or invalid. */
export function formatUsDate(instant: Date | string, zone: string): string {
	const dt = parseInstant(instant, zone);
	return dt ? dt.toFormat('MM-dd-yyyy') : '';
}

/** `h:mm a`, e.g. `9:30 PM` (legacy `eventTime.formatEventTime`). `''` when empty or invalid. */
export function formatClockTime(instant: Date | string, zone: string): string {
	const dt = parseInstant(instant, zone);
	return dt ? dt.toFormat('h:mm a') : '';
}

/**
 * `MMM d`, e.g. `Nov 11` (legacy `taskDisplay.formatDue` and the dashboard
 * `dueLabel`). The year is appended — `Nov 11, 2026` — when the instant's
 * local year differs from `now`'s: long recurring tasks need the year.
 * `''` when the instant is empty or invalid.
 */
export function formatDayMonth(instant: Date | string, now: Date | string, zone: string): string {
	const dt = parseInstant(instant, zone);
	if (!dt) return '';
	return formatWithYear(dt, parseInstant(now, zone)?.year, 'MMM d', 'MMM d, yyyy');
}

/**
 * `MMMM d, yyyy`, e.g. `November 11, 2026` (legacy `taskDisplay.formatDueLong`).
 * `''` when empty or invalid.
 */
export function formatLongDate(instant: Date | string, zone: string): string {
	const dt = parseInstant(instant, zone);
	return dt ? dt.toFormat('MMMM d, yyyy') : '';
}

/**
 * `ccc, MMM d`, e.g. `Sat, Sep 5` (legacy `taskFeedback.shortDate`), with the
 * year appended when it differs from `now`'s: `Sat, Sep 5, 2026`.
 * `''` when the instant is empty or invalid.
 */
export function formatShortDate(instant: Date | string, now: Date | string, zone: string): string {
	const dt = parseInstant(instant, zone);
	if (!dt) return '';
	return formatWithYear(dt, parseInstant(now, zone)?.year, 'ccc, MMM d', 'ccc, MMM d, yyyy');
}

/**
 * `yyyy-MM-dd` in `zone`: the calendar-day key used by list buckets, task
 * input values and the admin export (legacy `dateKeyOf`, `toInputDate`).
 * `''` when empty or invalid.
 */
export function dayKey(instant: Date | string, zone: string): string {
	const dt = parseInstant(instant, zone);
	return dt?.toISODate() ?? '';
}

/**
 * `yyyy-MM-dd HH:mm`, e.g. `2026-11-11 09:30` (legacy admin `humanDate`).
 * `''` when empty or invalid.
 */
export function formatDateTimeMinute(instant: Date | string, zone: string): string {
	const dt = parseInstant(instant, zone);
	return dt ? dt.toFormat('yyyy-MM-dd HH:mm') : '';
}

/**
 * Calendar-day distance from `now` in `zone`, in words: `today`, `in 3 days`,
 * `10 days ago`, `4 weeks ago`, `2 months ago`. Under 14 days stays days,
 * under 60 days is weeks (`floor(days / 7)`), beyond is months
 * (`floor(days / 30)`) — the thresholds of the existing relative copy
 * (`accountSubscription.lastUsedLabel`), but counted in calendar days in the
 * zone, and with no "yesterday" word. `''` when the instant is empty or
 * invalid.
 */
export function relativeFromNow(instant: Date | string, now: Date | string, zone: string): string {
	const dt = parseInstant(instant, zone);
	const base = parseInstant(now, zone);
	if (!dt || !base) return '';
	const days = Math.round(dt.startOf('day').diff(base.startOf('day'), 'days').days);
	if (days === 0) return 'today';
	const magnitude = Math.abs(days);
	const [n, noun]: [number, string] =
		magnitude < 14
			? [magnitude, 'day']
			: magnitude < 60
				? [Math.floor(magnitude / 7), 'week']
				: [Math.floor(magnitude / 30), 'month'];
	const text = `${n} ${noun}${n === 1 ? '' : 's'}`;
	return days < 0 ? `${text} ago` : `in ${text}`;
}

/**
 * Buckets items by their day key in `zone`, in one pass, replacing the
 * per-day-cell `.filter()` scans (legacy `groupByDateKey` ×2). Keys come in
 * first-appearance order; items whose instant is empty or invalid are skipped.
 */
export function groupByDay<T>(
	items: T[],
	instantOf: (item: T) => Date | string | null | undefined,
	zone: string
): Map<string, T[]> {
	const buckets = new Map<string, T[]>();
	for (const item of items) {
		const value = instantOf(item);
		const key = value == null ? '' : dayKey(value, zone);
		if (!key) continue;
		const bucket = buckets.get(key);
		if (bucket) bucket.push(item);
		else buckets.set(key, [item]);
	}
	return buckets;
}

/**
 * Shift a `yyyy-MM-dd` calendar date by whole months, clamping the day to the
 * target month's length: `2026-01-31` + 1 → `2026-02-28` (`2028-01-31` + 1 →
 * `2028-02-29`). A clamped day never rolls into the next month — `2026-12-31`
 * + 2 → `2027-02-28`, not 3 March. Negative months work. `''` when the date is
 * not a real `yyyy-MM-dd` or `months` is not an integer.
 */
export function addMonthsClamped(date: string, months: number): string {
	if (!isoDate().safeParse(date).success || !Number.isInteger(months)) return '';
	const shifted = DateTime.fromISO(date, { zone: 'utc' }).plus({ months });
	if (!shifted.isValid || shifted.year < 1 || shifted.year > 9999) return '';
	return shifted.toISODate() ?? '';
}

// ---------------------------------------------------------------------------
// Calendar arithmetic (K-06): month lengths, the one rollover rule, the
// weekday rule and the local-clock date shift that parsing's grammars share.
// Plain year/month/day values on purpose — no zone, no `Date` probe — so a
// caller builds its own instant from the answer.
// ---------------------------------------------------------------------------

/** A calendar date with no time and no zone. `month` is 1-based. */
export interface CalendarDate {
	year: number;
	/** 1 = January … 12 = December. */
	month: number;
	day: number;
}

/** Month lengths for a common year, 1-based (index 0 = January). */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Proleptic Gregorian leap year — the rule that gives Feb its 29th. */
function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Days in a 1-based month. Pure arithmetic rather than a `Date` probe: a
 * `Date` cannot represent "Feb 29 in a non-leap year", so asking one for the
 * length of a February it will never hold silently rolls into March. 0 for a
 * month outside 1..12.
 */
export function daysInMonth(year: number, month: number): number {
	if (month < 1 || month > 12) return 0;
	return month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month - 1];
}

/**
 * THE rollover rule, shared by every parser: an explicit year is
 * authoritative, even in the past; otherwise the date is taken in the current
 * year and rolls to next year only when it sits STRICTLY BEFORE today —
 * **today stays today**. The day is clamped to the target month's length
 * ("feb 30" is the 28th), and a CLAMPED day never rolls. Null when the month
 * or day cannot name a real calendar date.
 */
export function resolveMonthDay(
	now: CalendarDate,
	month: number,
	day: number,
	explicitYear: number | null
): CalendarDate | null {
	if (!Number.isInteger(month) || month < 1 || month > 12) return null;
	if (!Number.isInteger(day) || day < 1 || day > 31) return null;
	const year = explicitYear ?? now.year;
	const clamped = Math.min(day, daysInMonth(year, month));
	const resolved: CalendarDate = { year, month, day: clamped };
	if (explicitYear !== null) return resolved;
	if (clamped !== day) return resolved;
	if (month < now.month || (month === now.month && clamped < now.day)) {
		return { ...resolved, year: year + 1 };
	}
	return resolved;
}

/**
 * THE weekday rule: days from a weekday to the next occurrence of another,
 * 1..7. Both 0-based Sunday-first (JS `Date.getDay`). Today is never "0 days
 * away" — a bare weekday name is always the NEXT one.
 */
export function daysUntilWeekday(from: number, to: number): number {
	let delta = (((to - from) % 7) + 7) % 7;
	if (delta === 0) delta = 7;
	return delta;
}

/**
 * The instant at which `instant`'s local day starts in `zone`. An invalid
 * instant or zone yields an invalid Date (`Number.isNaN(date.getTime())`).
 */
export function startOfDayIn(zone: string, instant: Date | string): Date {
	const dt = parseInstant(instant, zone);
	return dt ? dt.startOf('day').toJSDate() : new Date(NaN);
}

/**
 * Whether `zone` is an IANA zone luxon can format in (`America/New_York`,
 * `UTC`). Unknown names and `''` are false (legacy `dateUtils.isValidTimeZone`).
 */
export function isValidZone(zone: string): boolean {
	return IANAZone.isValidZone(zone);
}

/**
 * Normalize the timestamp shapes rows arrive in — ISO strings, Postgres
 * `YYYY-MM-DD HH:MM:SS` (space separator, offset optional) and `Date`
 * instances — to a UTC ISO string (legacy `toDateTime`, `parseTimestamp`,
 * `isoOrNull`, `toIsoTimestamp`, `toIso`). It parses by the same rule as the
 * formatters: an offset-less date-time is UTC (never the host zone), a
 * date-only string is that day's UTC midnight. `null` when the value is empty,
 * not a string/Date, or invalid.
 */
export function toInstantString(value: Date | string | null | undefined): string | null {
	return parseInstant(value, 'utc')?.toISO() ?? null;
}
