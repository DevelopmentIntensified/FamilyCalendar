/**
 * RFC 5545 in both directions: the export builders (`.ics` + Google Calendar
 * render link) and the parser the import preview describes. Ported from
 * `utils/ics.ts` and `icsImportService.ts`.
 *
 * Export: UTC `Z` instants regardless of the viewer's zone; all-day uses
 * `VALUE=DATE` with an EXCLUSIVE DTEND (the DB stores inclusive end-of-day, so
 * the builder rolls one day forward); RRULE emits INTERVAL only above 1, then
 * BYDAY, and UNTIL wins over COUNT. `DTSTAMP` is the caller's `now` — a pure
 * rule never reads the clock.
 *
 * Import: unfold continuation lines; skip CANCELLED rows and rows without
 * SUMMARY/DTSTART; date-only → UTC midnight + allDay; TZID is mapped and
 * floating times read as UTC; missing DTEND falls back to DURATION then +1
 * hour; an all-day exclusive DTEND is stored as inclusive end-of-day; the
 * title is trimmed to 200 chars; at most 500 rows.
 *
 * The parser keeps its own ordinal guard (Q-045): it strips the ordinal and
 * then requires the stripped list to equal the raw BYDAY, so ONE ordinal day
 * drops the whole BYDAY. `sanitizeRecurrenceByDay` deliberately does not.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import type { RecurrenceFrequency } from '$lib/kernel/time/dates';

export const ICS_DOMAIN = 'familyplanz.com';

/** The parser's cap: one .ics file contributes at most this many rows. */
export const MAX_ICS_EVENTS = 500;

/** The export recurrence shape (the Event row's columns). */
export interface IcsRecurrence {
	readonly recurrenceFrequency: string | null;
	readonly recurrenceInterval: number | null;
	readonly recurrenceByDay: string[] | null;
	readonly recurrenceCount: number | null;
	readonly recurrenceUntil: string | Date | null;
}

export interface IcsEventInput {
	readonly id: string;
	readonly title: string;
	readonly start: string | Date;
	readonly end?: string | Date | null;
	readonly allDay?: boolean;
	readonly description?: string | null;
	readonly location?: string | null;
	readonly recurrence?: IcsRecurrence | null;
}

export interface GoogleCalendarInput extends IcsEventInput {
	/** Viewer's IANA zone, appended as `ctz` so Google labels the time right. */
	readonly timeZone?: string;
}

/** One parsed VEVENT; the import preview's raw material. */
export interface IcsEventDraft {
	readonly title: string;
	readonly startIso: string;
	readonly endIso: string | null;
	readonly allDay: boolean;
	readonly location: string | null;
	readonly description: string | null;
	readonly recurrenceFrequency: RecurrenceFrequency | null;
	readonly recurrenceInterval: number | null;
	readonly recurrenceByDay: string[] | null;
	readonly recurrenceCount: number | null;
	readonly recurrenceUntil: string | null;
}

const FREQ_BY_NAME: Readonly<Record<RecurrenceFrequency, string>> = {
	daily: 'DAILY',
	weekly: 'WEEKLY',
	monthly: 'MONTHLY',
	yearly: 'YEARLY'
};

const FREQ_MAP: Readonly<Record<string, RecurrenceFrequency>> = {
	DAILY: 'daily',
	WEEKLY: 'weekly',
	MONTHLY: 'monthly',
	YEARLY: 'yearly'
};

/** Normalize the runtime timestamp shapes (Date / ISO / pg space form). */
function toDate(value: string | Date): Date {
	if (value instanceof Date) return value;
	const dt = DateTime.fromISO(String(value).trim().replace(' ', 'T'), { zone: 'utc' });
	return dt.isValid ? dt.toJSDate() : new Date(NaN);
}

/** Escape per RFC 5545 §3.3.11: backslash, semicolon, comma, newlines. */
export function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r\n/g, '\\n')
		.replace(/\r|\n/g, '\\n');
}

/** UTC instant in ICS form: `YYYYMMDDTHHMMSSZ`. */
export function formatIcsUtc(value: string | Date): string {
	return DateTime.fromJSDate(toDate(value), { zone: 'utc' }).toFormat("yyyyMMdd'T'HHmmss'Z'");
}

/** Calendar date in ICS form: `YYYYMMDD` (the UTC date part). */
export function formatIcsDate(value: string | Date): string {
	return DateTime.fromJSDate(toDate(value), { zone: 'utc' }).toFormat('yyyyMMdd');
}

/**
 * Everything after `RRULE:` from the normalized recurrence columns — the exact
 * inverse of the parser. Null for a non-recurring event or an unknown
 * frequency. RFC 5545 allows one of COUNT/UNTIL, so UNTIL wins.
 */
export function buildRrule(rec: IcsRecurrence): string | null {
	const frequency = rec.recurrenceFrequency;
	if (
		frequency !== 'daily' &&
		frequency !== 'weekly' &&
		frequency !== 'monthly' &&
		frequency !== 'yearly'
	) {
		return null;
	}
	const parts: string[] = [`FREQ=${FREQ_BY_NAME[frequency]}`];
	const interval = Math.max(1, Math.floor(rec.recurrenceInterval ?? 1));
	if (interval > 1) parts.push(`INTERVAL=${interval}`);
	if (rec.recurrenceByDay && rec.recurrenceByDay.length > 0) {
		parts.push(`BYDAY=${rec.recurrenceByDay.join(',')}`);
	}
	if (rec.recurrenceUntil) {
		parts.push(`UNTIL=${formatIcsUtc(rec.recurrenceUntil)}`);
	} else if (rec.recurrenceCount != null && rec.recurrenceCount > 0) {
		parts.push(`COUNT=${Math.floor(rec.recurrenceCount)}`);
	}
	return parts.join(';');
}

/**
 * The VEVENT lines for one occurrence or series. Callers feed the master row
 * for a series export, or a scope-'this' exception's fields (recurrence
 * dropped) for a single instance. `now` stamps DTSTAMP.
 */
export function buildIcsEvent(input: IcsEventInput, now: Date | string): string[] {
	const start = toDate(input.start);
	const allDay = !!input.allDay;
	const lines: string[] = ['BEGIN:VEVENT'];
	lines.push(`UID:${input.id}@${ICS_DOMAIN}`);
	lines.push(`DTSTAMP:${formatIcsUtc(now)}`);

	if (allDay) {
		lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(start)}`);
		// DTEND is exclusive; the DB end is inclusive end-of-day.
		const endSource = input.end ? toDate(input.end) : null;
		const endBase =
			endSource && !Number.isNaN(endSource.getTime())
				? DateTime.fromJSDate(endSource, { zone: 'utc' }).startOf('day')
				: DateTime.fromJSDate(start, { zone: 'utc' }).startOf('day');
		lines.push(`DTEND;VALUE=DATE:${endBase.plus({ days: 1 }).toFormat('yyyyMMdd')}`);
	} else {
		lines.push(`DTSTART:${formatIcsUtc(start)}`);
		const endSource = input.end ? toDate(input.end) : null;
		const end =
			endSource && !Number.isNaN(endSource.getTime())
				? endSource
				: DateTime.fromJSDate(start, { zone: 'utc' }).plus({ hours: 1 }).toJSDate();
		lines.push(`DTEND:${formatIcsUtc(end)}`);
	}

	lines.push(`SUMMARY:${escapeIcsText(input.title ?? '')}`);
	if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
	if (input.location) lines.push(`LOCATION:${escapeIcsText(input.location)}`);

	const rrule = input.recurrence ? buildRrule(input.recurrence) : null;
	if (rrule) lines.push(`RRULE:${rrule}`);

	lines.push('END:VEVENT');
	return lines;
}

/** Wrap one or more VEVENT line-arrays in a CRLF-delimited VCALENDAR. */
export function buildIcsCalendar(vevents: string[][]): string {
	const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN'];
	for (const vevent of vevents) lines.push(...vevent);
	lines.push('END:VCALENDAR');
	return lines.join('\r\n') + '\r\n';
}

/** File-system-safe download name from the event title (`event.ics` fallback). */
export function icsFilename(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
	return `${slug || 'event'}.ics`;
}

/**
 * Google Calendar "Add to calendar" render URL; recurrence rides the
 * URL-encoded RRULE. All-day uses the date-only `YYYYMMDD/YYYYMMDD` form with
 * an exclusive end date.
 */
export function buildGoogleCalendarUrl(input: GoogleCalendarInput): string {
	const params = new URLSearchParams();
	params.set('action', 'TEMPLATE');
	params.set('text', input.title ?? '');
	if (input.allDay) {
		const start = formatIcsDate(toDate(input.start));
		const endSource = input.end ? toDate(input.end) : null;
		const endBase =
			endSource && !Number.isNaN(endSource.getTime())
				? DateTime.fromJSDate(endSource, { zone: 'utc' }).startOf('day')
				: DateTime.fromJSDate(toDate(input.start), { zone: 'utc' }).startOf('day');
		params.set('dates', `${start}/${endBase.plus({ days: 1 }).toFormat('yyyyMMdd')}`);
	} else {
		const endSource = input.end ? toDate(input.end) : null;
		const end =
			endSource && !Number.isNaN(endSource.getTime())
				? endSource
				: DateTime.fromJSDate(toDate(input.start), { zone: 'utc' })
						.plus({ hours: 1 })
						.toJSDate();
		params.set('dates', `${formatIcsUtc(input.start)}/${formatIcsUtc(end)}`);
	}
	const rrule = input.recurrence ? buildRrule(input.recurrence) : null;
	if (rrule) params.set('recur', `RRULE:${rrule}`);
	if (input.description) params.set('details', input.description);
	if (input.location) params.set('location', input.location);
	if (input.timeZone) params.set('ctz', input.timeZone);
	return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// --- Import: parser --------------------------------------------------------

interface IcsProp {
	readonly name: string;
	readonly params: Readonly<Record<string, string>>;
	readonly value: string;
}

function unfold(raw: string): string[] {
	const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
	const out: string[] = [];
	for (const line of lines) {
		if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
			out[out.length - 1] += line.slice(1);
		} else {
			out.push(line);
		}
	}
	return out;
}

function parseProp(line: string): IcsProp | null {
	const colon = line.indexOf(':');
	if (colon === -1) return null;
	const left = line.slice(0, colon);
	const value = line.slice(colon + 1).trim();
	const parts = left.split(';');
	const name = parts[0].toUpperCase();
	const params: Record<string, string> = {};
	for (const part of parts.slice(1)) {
		const eq = part.indexOf('=');
		if (eq > -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).toUpperCase();
	}
	return { name, params, value };
}

/**
 * Map an Outlook pseudo-TZID to a real IANA zone. Unknown or absent names fall
 * back to UTC (a floating time), preserving prior behaviour.
 */
const TZID_ZONE: Readonly<Record<string, string>> = {
	'EASTERN STANDARD TIME': 'America/New_York',
	'CENTRAL STANDARD TIME': 'America/Chicago',
	'MOUNTAIN STANDARD TIME': 'America/Denver',
	'PACIFIC STANDARD TIME': 'America/Los_Angeles',
	'AMERICA/NEW_YORK': 'America/New_York',
	'AMERICA/CHICAGO': 'America/Chicago',
	'AMERICA/DENVER': 'America/Denver',
	'AMERICA/LOS_ANGELES': 'America/Los_Angeles'
};

function tzidZone(tzid?: string): string {
	if (!tzid) return 'utc';
	const key = tzid.replace(/^"|"$/g, '').toUpperCase();
	return TZID_ZONE[key] ?? 'utc';
}

/** ICS date/datetime → ISO; date-only becomes UTC midnight + allDay. */
function parseIcsDateTime(prop: IcsProp): { iso: string; allDay: boolean } | null {
	const value = prop.value.replace(/[^0-9TZ]/g, '');
	const isDateOnly = prop.params['VALUE'] === 'DATE' || /^\d{8}$/.test(value);
	if (isDateOnly) {
		const dt = DateTime.fromFormat(value.slice(0, 8), 'yyyyMMdd', { zone: 'utc' });
		const iso = dt.isValid ? dt.startOf('day').toISO() : null;
		return iso ? { iso, allDay: true } : null;
	}
	const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?/);
	if (!match) return null;
	const dt = DateTime.fromObject(
		{
			year: +match[1],
			month: +match[2],
			day: +match[3],
			hour: +match[4],
			minute: +match[5],
			second: match[6] ? +match[6] : 0
		},
		{ zone: tzidZone(prop.params['TZID']) }
	);
	const iso = dt.isValid ? dt.toUTC().toISO() : null;
	return iso ? { iso, allDay: false } : null;
}

/** RRULE UNTIL → UTC ISO, date-only form inclusive of that day. */
function parseRruleUntil(until: string): string | null {
	const clean = until.replace(/[^0-9TZ]/g, '');
	if (/^\d{8}$/.test(clean)) {
		const dt = DateTime.fromFormat(clean, 'yyyyMMdd', { zone: 'utc' });
		return dt.isValid ? dt.toUTC().toISO() : null;
	}
	const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z?$/);
	if (!match) return null;
	const dt = DateTime.utc(+match[1], +match[2], +match[3], +match[4], +match[5], match[6] ? +match[6] : 0);
	return dt.isValid ? dt.toUTC().toISO() : null;
}

function parseDurationToMs(duration: string): number | null {
	const match = duration.match(
		/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
	);
	if (!match) return null;
	const group = (index: number) => (match[index] ? parseInt(match[index], 10) : 0);
	const sign = match[1] === '-' ? -1 : 1;
	const weeks = group(2);
	const days = group(3);
	const hours = group(4);
	const minutes = group(5);
	const seconds = group(6);
	return (
		sign * ((weeks * 7 * 24 + days * 24) * 3600000 + (hours * 3600 + minutes * 60 + seconds) * 1000)
	);
}

const WEEKDAYS = new Set(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);

function unescapeText(value: string): string {
	return value
		.replace(/\\n/gi, '\n')
		.replace(/\\,/g, ',')
		.replace(/\\;/g, ';')
		.replace(/\\\\/g, '\\');
}

/** Parse every VEVENT in an .ics text into drafts (at most MAX_ICS_EVENTS). */
export function parseIcs(raw: string): IcsEventDraft[] {
	const events: IcsEventDraft[] = [];
	const lines = unfold(raw);

	let current: Record<string, IcsProp[]> | null = null;
	for (const line of lines) {
		if (/^BEGIN:VEVENT$/i.test(line)) {
			current = {};
			continue;
		}
		if (/^END:VEVENT$/i.test(line)) {
			if (current) {
				const draft = buildDraft(current);
				if (draft && events.length < MAX_ICS_EVENTS) events.push(draft);
			}
			current = null;
			continue;
		}
		if (!current || line.startsWith('BEGIN:') || line.startsWith('END:')) continue;
		const prop = parseProp(line);
		if (!prop) continue;
		(current[prop.name] ||= []).push(prop);
	}
	return events;
}

function buildDraft(props: Record<string, IcsProp[]>): IcsEventDraft | null {
	const first = (name: string) => props[name]?.[0];

	if (first('STATUS')?.value.toUpperCase() === 'CANCELLED') return null;
	const summary = first('SUMMARY');
	const dtstart = first('DTSTART');
	if (!summary?.value.trim() || !dtstart) return null;

	const startParsed = parseIcsDateTime(dtstart);
	if (!startParsed) return null;

	let endIso: string | null = null;
	const dtend = first('DTEND');
	const duration = first('DURATION');
	if (dtend) {
		const endParsed = parseIcsDateTime(dtend);
		if (endParsed) {
			if (startParsed.allDay && endParsed.allDay) {
				// ICS DTEND is exclusive; store inclusive end-of-day before it.
				endIso = DateTime.fromISO(endParsed.iso, { zone: 'utc' })
					.minus({ days: 1 })
					.endOf('day')
					.toUTC()
					.toISO();
			} else {
				endIso = endParsed.iso;
			}
		}
	} else if (duration?.value) {
		const ms = parseDurationToMs(duration.value);
		if (ms !== null) {
			endIso = DateTime.fromISO(startParsed.iso, { zone: 'utc' }).plus(ms).toUTC().toISO();
		}
	} else if (!startParsed.allDay) {
		endIso = DateTime.fromISO(startParsed.iso, { zone: 'utc' })
			.plus({ hours: 1 })
			.toUTC()
			.toISO();
	}

	let recurrenceFrequency: RecurrenceFrequency | null = null;
	let recurrenceInterval: number | null = 1;
	let recurrenceByDay: string[] | null = null;
	let recurrenceCount: number | null = null;
	let recurrenceUntil: string | null = null;
	const rrule = first('RRULE');
	if (rrule) {
		const parts: Record<string, string> = {};
		for (const piece of rrule.value.split(';')) {
			const eq = piece.indexOf('=');
			if (eq > -1) parts[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1).toUpperCase();
		}
		const rawFrequency = parts['FREQ'] ?? '';
		recurrenceFrequency = rawFrequency in FREQ_MAP ? FREQ_MAP[rawFrequency] : null;
		const interval = parseInt(parts['INTERVAL'] ?? '1');
		recurrenceInterval = recurrenceFrequency
			? Math.max(1, Number.isNaN(interval) ? 1 : interval)
			: null;

		// Q-045: strip any ordinal prefix, then require the stripped list to
		// equal the raw value; one ordinal day drops the WHOLE BYDAY.
		const rawDays = parts['BYDAY'];
		if (rawDays && recurrenceFrequency) {
			const days = rawDays
				.split(',')
				.map((day) => day.replace(/^[+-]?\d+/, ''))
				.filter((day) => WEEKDAYS.has(day));
			if (days.length > 0 && days.join(',') === rawDays) recurrenceByDay = days;
		}

		const count = parseInt(parts['COUNT'] ?? '');
		if (recurrenceFrequency && !Number.isNaN(count) && count > 0) recurrenceCount = count;

		const until = parts['UNTIL'];
		if (recurrenceFrequency && until) recurrenceUntil = parseRruleUntil(until);
	}

	const location = first('LOCATION');
	const description = first('DESCRIPTION');
	return {
		title: unescapeText(summary.value.trim()).slice(0, 200),
		startIso: startParsed.iso,
		endIso,
		allDay: startParsed.allDay,
		location: location?.value ? unescapeText(location.value.trim()) || null : null,
		description: description?.value ? unescapeText(description.value.trim()) || null : null,
		recurrenceFrequency,
		recurrenceInterval,
		recurrenceByDay,
		recurrenceCount,
		recurrenceUntil
	};
}
