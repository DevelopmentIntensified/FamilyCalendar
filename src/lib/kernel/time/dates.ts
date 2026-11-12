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
