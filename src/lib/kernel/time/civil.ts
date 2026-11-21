/**
 * Calendar-and-clock arithmetic without the date library: the day key, the
 * minute-precision timestamp and the month shift, plus the two conversions
 * they need (a wire instant to the zone's calendar fields, and the reverse for
 * a bare date).
 *
 * Why it exists: `./dates` is the module's one formatter home, but it parses
 * with luxon, and a module entry is loaded whole — the admin registers and the
 * tasks cursor wanted one day key and were shipping the date library to those
 * pages (ADR 0010, legacy had none). These three functions are the ones a
 * non-formatting caller asks for; `./dates` re-exports them, so they still
 * have one home.
 *
 * Zone conversion is `Intl.DateTimeFormat` with `en-US` and `h23`: the same
 * pinned locale `./dates` formats in, so the two modules cannot disagree about
 * what day it is in a zone. Parsing follows `./dates`' one rule — `yyyy-MM-dd`
 * is that calendar day in the zone, a date-time without an offset is a UTC
 * instant — and refuses anything that is not one of those two shapes.
 *
 * Nothing here reads the clock (rule R5): every output is a function of the
 * parameters.
 *
 * Doc: src/lib/kernel/README.md#time
 */
import { isCalendarDate } from '../validation/primitives';

/** Month lengths for a common year, 1-based (index 0 = January). */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** `yyyy-MM-dd`, the date-only wire shape. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A date-time with an optional seconds/fraction and an optional offset. */
const DATE_TIME =
	/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

const pad2 = (value: number): string => String(value).padStart(2, '0');

const pad4 = (value: number): string => String(value).padStart(4, '0');

function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in a 1-based month; 0 for a month outside 1..12. */
function monthLength(year: number, month: number): number {
	if (month < 1 || month > 12) return 0;
	return month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month - 1];
}

/** The zone's calendar fields for an instant, or null for an unknown zone. */
function zonedFields(
	epochMs: number,
	zone: string
): { year: number; month: number; day: number; hour: number; minute: number } | null {
	let parts: Intl.DateTimeFormatPart[];
	try {
		parts = new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).formatToParts(new Date(epochMs));
	} catch {
		return null;
	}
	const field = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
	return {
		year: field('year'),
		month: field('month'),
		day: field('day'),
		hour: field('hour'),
		minute: field('minute')
	};
}

/** The offset of a numeric zone suffix, in minutes east of UTC. */
function offsetMinutes(suffix: string | undefined): number | null {
	if (!suffix) return 0;
	if (suffix === 'Z') return 0;
	const sign = suffix.startsWith('-') ? -1 : 1;
	const digits = suffix.slice(1).replace(':', '');
	const hours = Number(digits.slice(0, 2));
	const minutes = digits.length > 2 ? Number(digits.slice(2)) : 0;
	if (hours > 23 || minutes > 59) return null;
	return sign * (hours * 60 + minutes);
}

/** The two accepted shapes: a calendar day in the zone, or an instant. */
type ParsedInstant =
	| { readonly kind: 'day'; readonly text: string }
	| { readonly kind: 'instant'; readonly epochMs: number };

/**
 * The value as one of the two wire shapes, or null. A `Date` is an instant;
 * a string is its calendar day (`yyyy-MM-dd`) or a date-time, where no offset
 * means UTC — never the host zone.
 */
function parseInstant(value: Date | string | null | undefined): ParsedInstant | null {
	if (value instanceof Date) {
		const time = value.getTime();
		return Number.isNaN(time) ? null : { kind: 'instant', epochMs: time };
	}
	if (typeof value !== 'string') return null;
	const text = value.trim();
	if (!text) return null;
	if (isCalendarDate(text)) return { kind: 'day', text };
	const match = DATE_TIME.exec(text);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const second = match[6] ? Number(match[6]) : 0;
	const millisecond = match[7] ? Number(match[7].slice(0, 3).padEnd(3, '0')) : 0;
	if (month < 1 || month > 12 || day < 1 || day > monthLength(year, month)) return null;
	if (hour > 23 || minute > 59 || second > 59) return null;
	const offset = offsetMinutes(match[8]);
	if (offset === null) return null;
	const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
	return { kind: 'instant', epochMs: asUtc - offset * 60_000 };
}

/**
 * `yyyy-MM-dd` in `zone`: the calendar-day key used by list buckets, task
 * input values and the admin export (legacy `dateKeyOf`, `toInputDate`).
 * A bare `yyyy-MM-dd` is already its own key; `''` when empty or invalid.
 */
export function dayKey(instant: Date | string, zone: string): string {
	const parsed = parseInstant(instant);
	if (!parsed) return '';
	if (parsed.kind === 'day') return zonedFields(0, zone) ? parsed.text : '';
	const fields = zonedFields(parsed.epochMs, zone);
	return fields ? `${pad4(fields.year)}-${pad2(fields.month)}-${pad2(fields.day)}` : '';
}

/**
 * `yyyy-MM-dd HH:mm`, e.g. `2026-11-11 09:30` (legacy admin `humanDate`).
 * `''` when empty or invalid.
 */
export function formatDateTimeMinute(instant: Date | string, zone: string): string {
	const parsed = parseInstant(instant);
	if (!parsed) return '';
	if (parsed.kind === 'day') return zonedFields(0, zone) ? `${parsed.text} 00:00` : '';
	const fields = zonedFields(parsed.epochMs, zone);
	if (!fields) return '';
	return `${pad4(fields.year)}-${pad2(fields.month)}-${pad2(fields.day)} ${pad2(fields.hour)}:${pad2(fields.minute)}`;
}

/**
 * Shift a `yyyy-MM-dd` calendar date by whole months, clamping the day to the
 * target month's length: `2026-01-31` + 1 → `2026-02-28` (`2028-01-31` + 1 →
 * `2028-02-29`). A clamped day never rolls into the next month — `2026-12-31`
 * + 2 → `2027-02-28`, not 3 March. Negative months work. `''` when the date is
 * not a real `yyyy-MM-dd` or `months` is not an integer.
 */
export function addMonthsClamped(date: string, months: number): string {
	if (!isCalendarDate(date) || !Number.isInteger(months)) return '';
	const year = Number(date.slice(0, 4));
	const month = Number(date.slice(5, 7));
	const day = Number(date.slice(8, 10));
	const total = year * 12 + (month - 1) + months;
	const shiftedYear = Math.floor(total / 12);
	const shiftedMonth = total - shiftedYear * 12 + 1;
	if (shiftedYear < 1 || shiftedYear > 9999) return '';
	const shiftedDay = Math.min(day, monthLength(shiftedYear, shiftedMonth));
	return `${pad4(shiftedYear)}-${pad2(shiftedMonth)}-${pad2(shiftedDay)}`;
}
