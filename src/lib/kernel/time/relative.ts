/**
 * Relative day labels: "today", "3 days ago", "in 2 weeks".
 *
 * This is the luxon-free half of `dates.ts`. The alerts bell sits in the app
 * chrome, so the one label rule it asks for runs on every first paint; keeping
 * the rule here leaves luxon (21 KB) out of pages that need nothing else from
 * `dates.ts` (ADR 0010). The output is byte-for-byte the one `dates.ts` always
 * produced: whole calendar days between the two instants in `zone`, bucketed at
 * 14 days (days → weeks) and 60 days (weeks → months).
 *
 * One rule parses every string, the same rule `dates.ts` uses:
 * - `yyyy-MM-dd` is that calendar day in the zone;
 * - a date-time WITHOUT an offset is a UTC instant, then converted into the zone;
 * - a date-time WITH an offset keeps it, then converts into the zone.
 *
 * The zone is asked through `Intl`, which is the platform's own IANA table: it
 * answers the same calendar day luxon's `startOf('day')` did. (`IANAZone` and
 * `DateTime` are still the only homes for instants and formatting; nothing here
 * reads the clock — `now` is always a parameter, rule R5.)
 *
 * Doc: src/lib/kernel/README.md#time
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A date-time: date, time, optional fraction, optional offset. Capture order is the parse order. */
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?$/i;
const MS_PER_DAY = 86_400_000;

/** One formatter per zone; `null` for a zone `Intl` refuses. */
const FORMATTERS = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(zone: string): Intl.DateTimeFormat | null {
	if (typeof zone !== 'string' || !/^[A-Za-z]/.test(zone)) return null;
	const cached = FORMATTERS.get(zone);
	if (cached !== undefined) return cached;
	let formatter: Intl.DateTimeFormat | null = null;
	try {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});
	} catch {
		formatter = null;
	}
	FORMATTERS.set(zone, formatter);
	return formatter;
}

/** The day count of a calendar date, or null when that date does not exist. */
function dayNumber(year: number, month: number, day: number): number | null {
	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
	const ms = Date.UTC(year, month - 1, day);
	const date = new Date(ms);
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	)
		return null;
	return ms / MS_PER_DAY;
}

/**
 * The instant a date-time names, by the parse rule above; null when it names
 * none. The fields are checked here rather than handed to `Date.parse`, whose
 * leniency (a 30 February rolls forward) luxon never had — the refusals are
 * part of what this rule kept.
 */
function dateTimeMillis(text: string): number | null {
	const match = DATE_TIME.exec(text);
	if (!match) return null;
	const [year, month, day, hour, minute, second, fraction, offset] = match
		.slice(1)
		.map((part) => part ?? '');
	if (dayNumber(Number(year), Number(month), Number(day)) === null) return null;
	const hh = Number(hour);
	const mm = Number(minute);
	const ss = Number(second);
	if (hh > 23 || mm > 59 || ss > 59) return null;
	const ms = new Date(0);
	ms.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
	ms.setUTCHours(hh, mm, ss, fraction ? Math.round(Number(`0.${fraction}`) * 1000) : 0);
	return ms.getTime() - offsetMinutes(offset) * 60_000;
}

/** The offset a date-time carries in minutes east of UTC; absent and `Z` are UTC. */
function offsetMinutes(offset: string): number {
	if (!offset || offset.toUpperCase() === 'Z') return 0;
	const sign = offset.startsWith('-') ? -1 : 1;
	const [hours, minutes] = offset.slice(1).replace(':', '').match(/\d{2}/g) ?? ['0', '0'];
	return sign * (Number(hours) * 60 + Number(minutes));
}

/** The instant a value names, by the parse rule above; null when it names none. */
function instantMillis(value: Date | string): number | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
	if (typeof value !== 'string') return null;
	return dateTimeMillis(value.trim().replace(' ', 'T'));
}

/** The calendar day the value falls on in `zone`; null for bad input or an unknown zone. */
function dayInZone(value: Date | string, zone: string): number | null {
	const formatter = formatterFor(zone);
	if (!formatter) return null;
	if (typeof value === 'string') {
		const text = value.trim().replace(' ', 'T');
		const dateOnly = DATE_ONLY.exec(text);
		if (dateOnly) return dayNumber(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
	}
	const ms = instantMillis(value);
	if (ms === null) return null;
	let year = Number.NaN;
	let month = Number.NaN;
	let day = Number.NaN;
	for (const part of formatter.formatToParts(new Date(ms))) {
		if (part.type === 'year') year = Number(part.value);
		else if (part.type === 'month') month = Number(part.value);
		else if (part.type === 'day') day = Number(part.value);
	}
	return dayNumber(year, month, day);
}

/** "today", or whole calendar days from `now` in `zone`: "3 days ago", "in 2 weeks". */
export function relativeFromNow(instant: Date | string, now: Date | string, zone: string): string {
	const day = dayInZone(instant, zone);
	const base = dayInZone(now, zone);
	if (day === null || base === null) return '';
	const days = day - base;
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
