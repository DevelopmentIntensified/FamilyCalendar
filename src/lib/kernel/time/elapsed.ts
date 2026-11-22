/**
 * Elapsed-time labels: "2 days ago", "in 3 hours", "0 seconds ago".
 *
 * Luxon's `toRelative()` without luxon, so a page whose only date need is an
 * "ago" next to a feed line keeps the date library out of its first paint
 * (ADR 0010; `relative.ts` is the calendar-day sibling the alerts bell uses).
 * The output is the one `DateTime.fromISO(at).toRelative({ base })` produced.
 *
 * What it keeps from luxon, on purpose:
 * - units are tried largest first (years, months, days, hours, minutes,
 *   seconds) and the first with a whole count of 1 or more wins; the count
 *   truncates toward zero;
 * - years, months and days are CALENDAR steps in the zone (Jan 31 + 1 month is
 *   Feb 28; a day is the same wall-clock time tomorrow, so it can be 23 or 25
 *   hours across a DST change); hours, minutes and seconds are elapsed time;
 * - under a second both ways reads "0 seconds ago" when `now` is later and
 *   "in 0 seconds" otherwise;
 * - English (`en`, `en-US`) is spelled by hand and any other locale goes
 *   through `Intl.RelativeTimeFormat`, exactly as luxon does.
 *
 * What it reads (the same strings the Recent Activity rows carry):
 * - ISO: `2026-02-01`, `2026-02-01T10:00`, `…T10:00:00.123Z`, `…+05:30`, and the
 *   compact `20260201T1000` forms;
 * - Postgres text: `2026-02-01 10:00:00+00` (a space instead of the `T`).
 * A stamp with an offset keeps it. One WITHOUT an offset is a wall-clock time in
 * the zone (luxon's rule for these two parsers, unlike `dates.ts`' UTC rule).
 * Week dates, ordinal dates, signed years, `[Zone]` suffixes and time-only
 * strings are not read: they answer '' like any other string that is no date.
 *
 * The zone is the runtime's own unless `options.zone` names an IANA zone; an
 * unknown zone, an invalid `now` and an unparsable stamp all answer ''. The
 * offset a no-offset stamp is resolved with, inside a DST gap or overlap, is the
 * zone's offset at `now` (luxon used the wall clock there; this takes `now`, so
 * the answer is a function of its arguments — rule R5).
 *
 * Doc: src/lib/kernel/README.md#time
 */

const MINUTE = 60_000;
const DAY_MS = 86_400_000;

/** `yyyy[-MM[-dd]]`, optionally `Thh[:mm[:ss[.f]]]` and an offset: luxon's ISO shapes minus the exotic ones. */
const ISO_STAMP =
	/^(\d{4})(?:-?(\d\d)(?:-?(\d\d))?)?(?:T(\d\d)(?::?(\d\d)(?::?(\d\d)(?:[.,](\d{1,30}))?)?)?(?:(Z)|([+-]\d\d)(?::?(\d\d))?)?)?$/;
/** `yyyy-MM-dd[ hh[:mm[:ss[.f]]]][ ][offset]`: the Postgres text shape luxon's `fromSQL` reads. */
const SQL_STAMP =
	/^(\d{4})-(\d\d)-(\d\d)(?: (\d\d)(?::?(\d\d)(?::?(\d\d)(?:[.,](\d{1,30}))?)?)? ?(?:(Z)|([+-]\d\d)(?::?(\d\d))?)?)?$/;

/** Where `options` may point the label: a zone and a locale, both the runtime's own by default. */
export type ElapsedOptions = {
	/** IANA zone name; the runtime's zone when absent. */
	zone?: string;
	/** BCP 47 locale for the words; the runtime's locale when absent. */
	locale?: string;
};

/** An instant together with the zone offset in force at it, in minutes east of UTC. */
type Stamp = { ts: number; offset: number };
type OffsetAt = (ts: number) => number;
type CalendarUnit = 'year' | 'month' | 'day';
type ClockUnit = 'hour' | 'minute' | 'second';

const CLOCK_UNIT_MS: Record<ClockUnit, number> = { hour: 3_600_000, minute: 60_000, second: 1000 };

const ZONE_OFFSETS = new Map<string, OffsetAt | null>();
const RELATIVE_FORMATS = new Map<string, Intl.RelativeTimeFormat>();
const ENGLISH_LOCALES = new Map<string, boolean>();

/** `a mod b` that stays in `[0, b)` for negative `a`. */
function floorMod(a: number, b: number): number {
	return a - Math.floor(a / b) * b;
}

function isLeapYear(year: number): boolean {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Days in `month` (1-based, may be out of 1–12: the year carries). */
function daysInMonth(year: number, month: number): number {
	const monthInYear = floorMod(month - 1, 12) + 1;
	const normalYear = year + (month - monthInYear) / 12;
	return monthInYear === 2
		? isLeapYear(normalYear)
			? 29
			: 28
		: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthInYear - 1];
}

/** The UTC millisecond of wall-clock fields; fields past their range carry over (`setUTC*`, so years 0–99 stay literal). */
function fieldsToMillis(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second: number,
	millisecond: number
): number {
	const date = new Date(0);
	date.setUTCFullYear(year, month - 1, day);
	date.setUTCHours(hour, minute, second, millisecond);
	return date.getTime();
}

/** The zone's offset at a millisecond, by `Intl`; null for a name `Intl` refuses. */
function intlOffsetAt(zone: string): OffsetAt | null {
	if (!/^[A-Za-z]/.test(zone)) return null;
	let formatter: Intl.DateTimeFormat;
	try {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			hourCycle: 'h23',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric'
		});
	} catch {
		return null;
	}
	return (ts) => {
		const field = { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
		for (const part of formatter.formatToParts(ts)) {
			if (part.type in field) field[part.type as keyof typeof field] = Number(part.value);
		}
		const wallClock = fieldsToMillis(
			field.year,
			field.month,
			field.day,
			field.hour % 24,
			field.minute,
			field.second,
			0
		);
		return (wallClock - (ts - floorMod(ts, 1000))) / MINUTE;
	};
}

/** The runtime zone's own offset, or the named zone's; null when the name is no zone. */
function offsetResolver(zone: string | undefined): OffsetAt | null {
	if (zone === undefined) return (ts) => -new Date(ts).getTimezoneOffset();
	let resolver = ZONE_OFFSETS.get(zone);
	if (resolver === undefined) {
		resolver = intlOffsetAt(zone);
		ZONE_OFFSETS.set(zone, resolver);
	}
	return resolver;
}

/**
 * The instant of a wall-clock reading when the zone's offset may differ from the
 * `guess` (luxon's `fixOffset`): re-ask the zone at the guessed instant; inside a
 * gap or an overlap take the larger offset's reading.
 */
function resolveWallClock(wallClock: number, guess: number, offsetAt: OffsetAt): Stamp {
	let ts = wallClock - guess * MINUTE;
	const second = offsetAt(ts);
	if (second === guess) return { ts, offset: guess };
	ts -= (second - guess) * MINUTE;
	const third = offsetAt(ts);
	if (second === third) return { ts, offset: second };
	return { ts: wallClock - Math.min(second, third) * MINUTE, offset: Math.max(second, third) };
}

/** luxon's `signedOffset`, quirks included: `-00:30` is +30 minutes (a negative zero hour is falsy). */
function signedOffset(hourText: string | undefined, minuteText: string | undefined): number {
	const hours = Number.parseInt(hourText ?? '', 10) || 0;
	const minutes = Number.parseInt(minuteText ?? '', 10) || 0;
	return hours * 60 + (hours < 0 ? -minutes : minutes);
}

/** The instant a stamp names, or null when it is no date. */
function parseStamp(text: string, nowMs: number, offsetAt: OffsetAt): Stamp | null {
	const match = ISO_STAMP.exec(text) ?? SQL_STAMP.exec(text);
	if (!match) return null;
	const [, y, mo, d, h, mi, s, fraction, zulu, offsetHour, offsetMinute] = match;
	const year = Number(y);
	const month = mo === undefined ? 1 : Number(mo);
	const day = d === undefined ? 1 : Number(d);
	const hour = h === undefined ? 0 : Number(h);
	const minute = mi === undefined ? 0 : Number(mi);
	const second = s === undefined ? 0 : Number(s);
	// luxon floors the fraction to whole milliseconds.
	const millisecond = fraction === undefined ? 0 : Math.floor(Number.parseFloat(`0.${fraction}`) * 1000);
	if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
	const midnightHour = hour === 24 && minute === 0 && second === 0 && millisecond === 0;
	if ((hour > 23 && !midnightHour) || minute > 59 || second > 59) return null;
	const wallClock = fieldsToMillis(year, month, day, hour, minute, second, millisecond);
	if (zulu !== undefined || offsetHour !== undefined) {
		const offset = signedOffset(offsetHour, offsetMinute);
		const ts = wallClock - offset * MINUTE;
		return { ts, offset: offsetAt(ts) };
	}
	return resolveWallClock(wallClock, offsetAt(nowMs), offsetAt);
}

function wallFields(stamp: Stamp): Date {
	return new Date(stamp.ts + stamp.offset * MINUTE);
}

/** luxon's `plus({ [unit]: count })`: a calendar step on the wall-clock fields. */
function plus(stamp: Stamp, unit: CalendarUnit, count: number, offsetAt: OffsetAt): Stamp {
	const wall = wallFields(stamp);
	const year = wall.getUTCFullYear() + (unit === 'year' ? count : 0);
	const month = wall.getUTCMonth() + 1 + (unit === 'month' ? count : 0);
	const day = Math.min(wall.getUTCDate(), daysInMonth(year, month)) + (unit === 'day' ? count : 0);
	const wallClock = fieldsToMillis(
		year,
		month,
		day,
		wall.getUTCHours(),
		wall.getUTCMinutes(),
		wall.getUTCSeconds(),
		wall.getUTCMilliseconds()
	);
	// luxon trusts the resolved offset only for a stamp it just parsed; a stamp moved by
	// `plus` asks the zone again (and keeps its own when it did not move).
	const moved = resolveWallClock(wallClock, stamp.offset, offsetAt);
	return moved.ts === stamp.ts ? stamp : { ts: moved.ts, offset: offsetAt(moved.ts) };
}

/** Calendar days between the wall-clock dates of two stamps. */
function dayDifference(earlier: Stamp, later: Stamp): number {
	const dayStart = (stamp: Stamp) => Math.floor((stamp.ts + stamp.offset * MINUTE) / DAY_MS);
	return dayStart(later) - dayStart(earlier);
}

/**
 * How many `unit`s lie from `earlier` to `later`, fraction included (luxon's
 * `Duration` for one calendar unit): start from the field difference, back off
 * while the step overshoots, then add the part of the next step already covered.
 */
function calendarCount(
	earlier: Stamp,
	later: Stamp,
	unit: CalendarUnit,
	offsetAt: OffsetAt
): number {
	const a = wallFields(earlier);
	const b = wallFields(later);
	let count: number;
	if (unit === 'year') count = b.getUTCFullYear() - a.getUTCFullYear();
	else if (unit === 'month')
		count =
			b.getUTCMonth() -
			a.getUTCMonth() +
			(b.getUTCFullYear() - a.getUTCFullYear()) * 12;
	else count = dayDifference(earlier, later);

	let cursor = plus(earlier, unit, count, offsetAt);
	let highWater = cursor;
	if (highWater.ts > later.ts) {
		count -= 1;
		cursor = plus(earlier, unit, count, offsetAt);
		if (cursor.ts > later.ts) {
			highWater = cursor;
			count -= 1;
			cursor = plus(earlier, unit, count, offsetAt);
		}
	}
	if (highWater.ts < later.ts) highWater = plus(cursor, unit, 1, offsetAt);
	return highWater.ts === cursor.ts
		? count
		: count + (later.ts - cursor.ts) / (highWater.ts - cursor.ts);
}

function isEnglish(locale: string | undefined): boolean {
	const key = locale ?? '';
	let english = ENGLISH_LOCALES.get(key);
	if (english === undefined) {
		const resolved = new Intl.DateTimeFormat(locale).resolvedOptions().locale;
		english = resolved === 'en' || resolved.toLowerCase().startsWith('en-us');
		ENGLISH_LOCALES.set(key, english);
	}
	return english;
}

/** One phrase: "2 days ago" / "in 2 days"; `signed` carries the direction (a negative zero is the past). */
function phrase(signed: number, unit: CalendarUnit | ClockUnit, locale: string | undefined): string {
	if (!isEnglish(locale)) {
		const key = locale ?? '';
		let format = RELATIVE_FORMATS.get(key);
		if (!format) {
			format = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'long' });
			RELATIVE_FORMATS.set(key, format);
		}
		return format.format(signed, unit);
	}
	const count = Math.abs(signed);
	const text = `${count} ${unit}${count === 1 ? '' : 's'}`;
	return signed < 0 || Object.is(signed, -0) ? `${text} ago` : `in ${text}`;
}

const CALENDAR_UNITS: CalendarUnit[] = ['year', 'month', 'day'];
const CLOCK_UNITS: ClockUnit[] = ['hour', 'minute', 'second'];

/**
 * The age of `instant` as of `now`: "2 days ago", "in 3 hours". '' for a stamp
 * that is no date, an invalid `now` or an unknown zone.
 */
export function elapsedAgo(instant: string, now: Date, options: ElapsedOptions = {}): string {
	const nowMs = now.getTime();
	const offsetAt = offsetResolver(options.zone);
	if (Number.isNaN(nowMs) || !offsetAt || typeof instant !== 'string') return '';
	const at = parseStamp(instant, nowMs, offsetAt);
	if (!at) return '';
	const base: Stamp = { ts: nowMs, offset: offsetAt(nowMs) };
	const past = base.ts > at.ts;
	const [earlier, later] = past ? [at, base] : [base, at];
	const sign = past ? -1 : 1;

	for (const unit of CALENDAR_UNITS) {
		const count = calendarCount(earlier, later, unit, offsetAt);
		if (count >= 1) return phrase(sign * Math.trunc(count), unit, options.locale);
	}
	for (const unit of CLOCK_UNITS) {
		const count = (later.ts - earlier.ts) / CLOCK_UNIT_MS[unit];
		if (count >= 1) return phrase(sign * Math.trunc(count), unit, options.locale);
	}
	return phrase(past ? -0 : 0, 'second', options.locale);
}
