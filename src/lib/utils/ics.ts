import { DateTime } from 'luxon';

/**
 * ICS export + Google Calendar render-link builders (issue 028).
 *
 * Instants are exported as UTC ("Z" form) regardless of the viewer's zone:
 * consistent with the app's UTC-expansion model (see the DST ADR deferral),
 * recurring wall-times can drift across DST for non-UTC users. All-day
 * events use RFC 5545 date form (DTSTART;VALUE=DATE) with an exclusive
 * DTEND — the DB stores all-day ends as inclusive end-of-day, so the
 * builder rolls the DTEND date forward one day.
 */

export const ICS_DOMAIN = 'familyplanz.com';

/** Recurrence write shape as produced by normalizeEventRecurrence / the DB row. */
export interface IcsRecurrence {
	recurrenceFrequency: string | null;
	recurrenceInterval: number | null;
	recurrenceByDay: string[] | null;
	recurrenceCount: number | null;
	recurrenceUntil: string | Date | null;
}

export interface IcsEventInput {
	id: string;
	title: string;
	start: string | Date;
	end?: string | Date | null;
	allDay?: boolean;
	description?: string | null;
	location?: string | null;
	recurrence?: IcsRecurrence | null;
}

const FREQ_BY_NAME = {
	daily: 'DAILY',
	weekly: 'WEEKLY',
	monthly: 'MONTHLY',
	yearly: 'YEARLY'
} as const;

/** Escape per RFC 5545 §3.3.11: backslash, semicolon, comma, newlines. */
export function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r\n/g, '\\n')
		.replace(/\r|\n/g, '\\n');
}

/** UTC instant in ICS form: YYYYMMDDTHHMMSSZ. */
export function formatIcsUtc(v: string | Date): string {
	return DateTime.fromJSDate(toDate(v), { zone: 'utc' }).toFormat("yyyyMMdd'T'HHmmss'Z'");
}

/** Calendar date in ICS form: YYYYMMDD (UTC date part of the instant). */
export function formatIcsDate(v: string | Date): string {
	return DateTime.fromJSDate(toDate(v), { zone: 'utc' }).toFormat('yyyyMMdd');
}

/**
 * Build the RRULE payload (everything after "RRULE:") from the normalized
 * recurrence fields — no parsing re-invented; this is the inverse of what
 * icsImportService/store. Returns null for non-recurring events.
 * RFC 5545 allows exactly one of COUNT/UNTIL, so UNTIL wins when both exist.
 */
export function buildRrule(rec: IcsRecurrence): string | null {
	const freqName = rec.recurrenceFrequency;
	if (
		freqName !== 'daily' &&
		freqName !== 'weekly' &&
		freqName !== 'monthly' &&
		freqName !== 'yearly'
	) {
		return null;
	}
	const parts: string[] = [`FREQ=${FREQ_BY_NAME[freqName]}`];
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

/** Normalize the runtime timestamp shapes (Date / ISO / pg space form). */
function toDate(v: string | Date): Date {
	if (v instanceof Date) return v;
	const dt = DateTime.fromISO(String(v).trim().replace(' ', 'T'), { zone: 'utc' });
	return dt.isValid ? dt.toJSDate() : new Date(NaN);
}

/**
 * Build the VEVENT lines for one occurrence or series. Callers feed the
 * master row for series export, or a scope-'this' exception's fields
 * (with recurrence dropped) for a single-instance export.
 */
export function buildIcsEvent(input: IcsEventInput): string[] {
	const start = toDate(input.start);
	const allDay = !!input.allDay;
	const lines: string[] = ['BEGIN:VEVENT'];
	lines.push(`UID:${input.id}@${ICS_DOMAIN}`);
	lines.push(`DTSTAMP:${DateTime.utc().toFormat("yyyyMMdd'T'HHmmss'Z'")}`);

	if (allDay) {
		lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(start)}`);
		// DTEND is exclusive; the DB end is inclusive end-of-day.
		const endSrc = input.end ? toDate(input.end) : null;
		const endBase =
			endSrc && !isNaN(endSrc.getTime())
				? DateTime.fromJSDate(endSrc, { zone: 'utc' }).startOf('day')
				: DateTime.fromJSDate(start, { zone: 'utc' }).startOf('day');
		lines.push(`DTEND;VALUE=DATE:${endBase.plus({ days: 1 }).toFormat('yyyyMMdd')}`);
	} else {
		lines.push(`DTSTART:${formatIcsUtc(start)}`);
		const endSrc = input.end ? toDate(input.end) : null;
		const end =
			endSrc && !isNaN(endSrc.getTime())
				? endSrc
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

/** File-system-safe download name from the event title ("event.ics" fallback). */
export function icsFilename(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
	return `${slug || 'event'}.ics`;
}

export interface GoogleCalendarInput extends IcsEventInput {
	/** Viewer's IANA zone, appended as ctz so Google labels the time right. */
	timeZone?: string;
}

/**
 * Google Calendar "Add to calendar" render URL. Supports recurrence via the
 * URL-encoded RRULE (research in docs/issues/028). All-day events use the
 * date-only `YYYYMMDD/YYYYMMDD` form with an exclusive end date.
 */
export function buildGoogleCalendarUrl(input: GoogleCalendarInput): string {
	const params = new URLSearchParams();
	params.set('action', 'TEMPLATE');
	params.set('text', input.title ?? '');
	if (input.allDay) {
		const start = formatIcsDate(toDate(input.start));
		const endSrc = input.end ? toDate(input.end) : null;
		const endBase =
			endSrc && !isNaN(endSrc.getTime())
				? DateTime.fromJSDate(endSrc, { zone: 'utc' }).startOf('day')
				: DateTime.fromJSDate(toDate(input.start), { zone: 'utc' }).startOf('day');
		params.set('dates', `${start}/${endBase.plus({ days: 1 }).toFormat('yyyyMMdd')}`);
	} else {
		const endSrc = input.end ? toDate(input.end) : null;
		const end =
			endSrc && !isNaN(endSrc.getTime())
				? endSrc
				: DateTime.fromJSDate(toDate(input.start), { zone: 'utc' }).plus({ hours: 1 }).toJSDate();
		params.set('dates', `${formatIcsUtc(input.start)}/${formatIcsUtc(end)}`);
	}
	const rrule = input.recurrence ? buildRrule(input.recurrence) : null;
	if (rrule) params.set('recur', `RRULE:${rrule}`);
	if (input.description) params.set('details', input.description);
	if (input.location) params.set('location', input.location);
	if (input.timeZone) params.set('ctz', input.timeZone);
	return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
