import { DateTime } from 'luxon';

export type IcsFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface IcsEventDraft {
	title: string;
	startIso: string;
	endIso: string | null;
	allDay: boolean;
	location: string | null;
	description: string | null;
	recurrenceFrequency: IcsFrequency | null;
	recurrenceInterval: number | null;
	recurrenceByDay: string[] | null;
	recurrenceCount: number | null;
	recurrenceUntil: string | null;
}

const MAX_EVENTS = 500;

interface IcsProp {
	name: string;
	params: Record<string, string>;
	value: string;
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
	const colonIdx = line.indexOf(':');
	if (colonIdx === -1) return null;
	const left = line.slice(0, colonIdx);
	const value = line.slice(colonIdx + 1).trim();
	const parts = left.split(';');
	const name = parts[0].toUpperCase();
	const params: Record<string, string> = {};
	for (const p of parts.slice(1)) {
		const eq = p.indexOf('=');
		if (eq > -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).toUpperCase();
	}
	return { name, params, value };
}

/** ICS date/datetime -> ISO. Date-only => UTC midnight + allDay.
 *  TZID names are mapped (Outlook pseudo-names -> IANA zone) and the instant
 *  is converted to UTC. Floating times (no TZID) are treated as wall-clock
 *  UTC. */
function parseIcsDateTime(prop: IcsProp): { iso: string; allDay: boolean } | null {
	const v = prop.value.replace(/[^0-9TZ]/g, '');
	const isDateOnly = prop.params['VALUE'] === 'DATE' || /^\d{8}$/.test(v);
	if (isDateOnly) {
		const dt = DateTime.fromFormat(v.slice(0, 8), 'yyyyMMdd', { zone: 'utc' });
		return dt.isValid ? { iso: dt.startOf('day').toISO()!, allDay: true } : null;
	}
	const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?/);
	if (!m) return null;
	const dt = DateTime.fromObject(
		{
			year: +m[1],
			month: +m[2],
			day: +m[3],
			hour: +m[4],
			minute: +m[5],
			second: m[6] ? +m[6] : 0
		},
		{ zone: tzidZone(prop.params['TZID']) }
	);
	return dt.isValid ? { iso: dt.toUTC().toISO()!, allDay: false } : null;
}

/**
 * Map a TZID to a real IANA zone. Outlook exports pseudo-names like
 * "Eastern Standard Time" (which actually alternates EDT in summer); map
 * them to their canonical IANA equivalents. Unknown/absent names fall back
 * to UTC (floating time), preserving prior behavior.
 */
const TZID_ZONE: Record<string, string> = {
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

/**
 * Parse an RRULE UNTIL value into a UTC ISO instant, or null if malformed.
 * Supports both UTC datetime form (YYYYMMDDTHHMMSSZ) and the date-only form
 * (YYYYMMDD, inclusive of that day) used by all-day rules.
 */
function parseRruleUntil(until: string): string | null {
	const clean = until.replace(/[^0-9TZ]/g, '');
	if (/^\d{8}$/.test(clean)) {
		const dt = DateTime.fromFormat(clean, 'yyyyMMdd', { zone: 'utc' });
		return dt.isValid ? dt.toUTC().toISO() : null;
	}
	const m = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z?$/);
	if (!m) return null;
	const dt = DateTime.utc(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
	return dt.isValid ? dt.toUTC().toISO() : null;
}

function parseDurationToMs(dur: string): number | null {
	const m = dur.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
	if (!m) return null;
	const g = (i: number) => (m[i] ? parseInt(m[i], 10) : 0);
	const sign = m[1] === '-' ? -1 : 1;
	const weeks = g(2);
	const days = g(3);
	const hours = g(4);
	const minutes = g(5);
	const seconds = g(6);
	return (
		sign *
		((weeks * 7 * 24 + days * 24) * 3600000 + (hours * 3600 + minutes * 60 + seconds) * 1000)
	);
}

const FREQ_MAP: Record<string, IcsFrequency> = {
	DAILY: 'daily',
	WEEKLY: 'weekly',
	MONTHLY: 'monthly',
	YEARLY: 'yearly'
};

const WEEKDAYS = new Set(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);

function unescapeText(v: string): string {
	return v
		.replace(/\\n/gi, '\n')
		.replace(/\\,/g, ',')
		.replace(/\\;/g, ';')
		.replace(/\\\\/g, '\\');
}

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
				if (draft && events.length < MAX_EVENTS) events.push(draft);
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

	// Skip cancelled and empty events.
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
				const inclusiveEnd = DateTime.fromISO(endParsed.iso, { zone: 'utc' })
					.minus({ days: 1 })
					.endOf('day');
				endIso = inclusiveEnd.toUTC().toISO();
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
		endIso = DateTime.fromISO(startParsed.iso, { zone: 'utc' }).plus({ hours: 1 }).toUTC().toISO();
	}

	let recurrenceFrequency: IcsFrequency | null = null;
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
		recurrenceFrequency = FREQ_MAP[parts['FREQ']] ?? null;
		const interval = parseInt(parts['INTERVAL'] ?? '1');
		recurrenceInterval = recurrenceFrequency ? Math.max(1, isNaN(interval) ? 1 : interval) : null;

		// BYDAY: weekday letters (Outlook uses plain MO,WE,FR). Strip any
		// ordinal prefix (e.g. 2TU) so the set only holds plain weekday codes;
		// if anything isn't a plain weekday, bail to null to avoid mis-filtering.
		const rawDays = parts['BYDAY'];
		if (rawDays && recurrenceFrequency) {
			const days = rawDays
				.split(',')
				.map((d) => d.replace(/^[+-]?\d+/, ''))
				.filter((d) => WEEKDAYS.has(d));
			if (days.length > 0 && days.join(',') === rawDays) recurrenceByDay = days;
		}

		// COUNT: total number of occurrences in the series.
		const count = parseInt(parts['COUNT'] ?? '');
		if (recurrenceFrequency && !isNaN(count) && count > 0) recurrenceCount = count;

		// UNTIL: last occurrence of the series. Per RFC 5545 it is either a
		// UTC datetime (YYYYMMDDTHHMMSSZ) or, for date-only rules, a date
		// (YYYYMMDD) treated as inclusive.
		const until = parts['UNTIL'];
		if (recurrenceFrequency && until) {
			recurrenceUntil = parseRruleUntil(until);
		}
	}

	return {
		title: unescapeText(summary.value.trim()).slice(0, 200),
		startIso: startParsed.iso,
		endIso,
		allDay: startParsed.allDay,
		location: first('LOCATION')?.value ? unescapeText(first('LOCATION')!.value.trim()) || null : null,
		description: first('DESCRIPTION')?.value ? unescapeText(first('DESCRIPTION')!.value.trim()) || null : null,
		recurrenceFrequency,
		recurrenceInterval,
		recurrenceByDay,
		recurrenceCount,
		recurrenceUntil
	};
}
