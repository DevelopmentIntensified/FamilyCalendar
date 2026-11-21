/**
 * ICS rules both directions. Export vectors come from
 * `src/lib/utils/ics.test.ts:10-252`; parse vectors from
 * `src/lib/server/services/icsImportService.test.ts:5-231`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	buildGoogleCalendarUrl,
	buildIcsCalendar,
	buildIcsEvent,
	buildRrule,
	escapeIcsText,
	formatIcsDate,
	formatIcsUtc,
	icsFilename,
	MAX_ICS_EVENTS,
	parseIcs,
	type IcsRecurrence
} from './calendar.ics.rules';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const ics = (lines: string[]) => lines.join('\r\n');

/** The single VEVENT the import goldens parse. */
const ICS_ONE = ics([
	'BEGIN:VCALENDAR',
	'VERSION:2.0',
	'BEGIN:VEVENT',
	'SUMMARY:Soccer practice',
	'DTSTART:20260929T140000Z',
	'DTEND:20260929T153000Z',
	'END:VEVENT',
	'END:VCALENDAR'
]);

describe('escapeIcsText', () => {
	it.each([
		['plain text', 'plain text'],
		['a, b', 'a\\, b'],
		['a; b', 'a\\; b'],
		['line one\nline two', 'line one\\nline two'],
		['back\\slash', 'back\\\\slash'],
		['\r\nwindow', '\\nwindow']
	])('escapes %j', (raw, expected) => {
		expect(escapeIcsText(raw)).toBe(expected);
	});
});

describe('buildRrule', () => {
	const rec = (over: Partial<IcsRecurrence> = {}): IcsRecurrence => ({
		recurrenceFrequency: null,
		recurrenceInterval: null,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		...over
	});

	it.each([
		[
			'weekly with BYDAY and interval',
			rec({ recurrenceFrequency: 'weekly', recurrenceInterval: 2, recurrenceByDay: ['MO', 'WE'] }),
			'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'
		],
		['daily with count', rec({ recurrenceFrequency: 'daily', recurrenceInterval: 1, recurrenceCount: 10 }), 'FREQ=DAILY;COUNT=10'],
		[
			'monthly UNTIL beats COUNT',
			rec({
				recurrenceFrequency: 'monthly',
				recurrenceInterval: 1,
				recurrenceCount: 5,
				recurrenceUntil: '2027-01-31T23:59:59.000Z'
			}),
			'FREQ=MONTHLY;UNTIL=20270131T235959Z'
		],
		['yearly omits INTERVAL=1', rec({ recurrenceFrequency: 'yearly', recurrenceInterval: 1 }), 'FREQ=YEARLY'],
		['unknown frequency', rec({ recurrenceFrequency: 'sometimes', recurrenceInterval: 1 }), null],
		['null frequency', rec(), null]
	])('%s', (_name, recurrence, expected) => {
		expect(buildRrule(recurrence)).toBe(expected);
	});
});

describe('format helpers', () => {
	it('writes UTC instants and date-only ICS forms', () => {
		expect(formatIcsUtc('2026-09-10T18:00:00.000Z')).toBe('20260910T180000Z');
		expect(formatIcsDate('2026-09-10T18:00:00.000Z')).toBe('20260910');
	});
});

describe('buildIcsEvent', () => {
	const base = {
		id: 'evt12345678901',
		title: 'Soccer practice',
		start: '2026-09-10T18:00:00.000Z',
		end: '2026-09-10T19:30:00.000Z',
		allDay: false,
		description: null,
		location: null,
		recurrence: null
	};

	it('writes UTC Z-form instants, UID and the caller’s DTSTAMP', () => {
		const lines = buildIcsEvent(base, NOW);
		expect(lines).toContain(`UID:${base.id}@familyplanz.com`);
		expect(lines).toContain('DTSTAMP:20261001T120000Z');
		expect(lines).toContain('DTSTART:20260910T180000Z');
		expect(lines).toContain('DTEND:20260910T193000Z');
		expect(lines).toContain('SUMMARY:Soccer practice');
	});

	it('writes an all-day event as VALUE=DATE with an exclusive DTEND', () => {
		const lines = buildIcsEvent({ ...base, allDay: true, end: '2026-09-12T23:59:59.999Z' }, NOW);
		expect(lines).toContain('DTSTART;VALUE=DATE:20260910');
		expect(lines).toContain('DTEND;VALUE=DATE:20260913');
	});

	it('defaults an all-day end to one day and a timed end to one hour', () => {
		expect(buildIcsEvent({ ...base, allDay: true, end: null }, NOW)).toContain(
			'DTEND;VALUE=DATE:20260911'
		);
		expect(buildIcsEvent({ ...base, end: null }, NOW)).toContain('DTEND:20260910T190000Z');
	});

	it('escapes text and omits empty optional fields', () => {
		const lines = buildIcsEvent(
			{
				...base,
				title: 'Notes, part 1; part 2',
				description: 'Bring:\n- water',
				location: null
			},
			NOW
		);
		expect(lines).toContain('SUMMARY:Notes\\, part 1\\; part 2');
		expect(lines).toContain('DESCRIPTION:Bring:\\n- water');
		expect(lines.some((line) => line.startsWith('LOCATION:'))).toBe(false);
	});

	it('passes the RRULE through and drops it for a scope-this instance', () => {
		const lines = buildIcsEvent(
			{
				...base,
				recurrence: {
					recurrenceFrequency: 'weekly',
					recurrenceInterval: 1,
					recurrenceByDay: ['TH'],
					recurrenceCount: null,
					recurrenceUntil: null
				}
			},
			NOW
		);
		expect(lines).toContain('RRULE:FREQ=WEEKLY;BYDAY=TH');
		expect(buildIcsEvent(base, NOW).some((line) => line.startsWith('RRULE:'))).toBe(false);
	});

	it('accepts Date inputs', () => {
		expect(buildIcsEvent({ ...base, start: new Date('2026-09-10T18:00:00.000Z') }, NOW)).toContain(
			'DTSTART:20260910T180000Z'
		);
	});
});

describe('buildIcsCalendar and icsFilename', () => {
	it('wraps VEVENTs in a CRLF-delimited VCALENDAR', () => {
		const body = buildIcsCalendar([
			['BEGIN:VEVENT', 'UID:a@x', 'END:VEVENT'],
			['BEGIN:VEVENT', 'UID:b@x', 'END:VEVENT']
		]);
		expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(body.endsWith('\r\nEND:VCALENDAR\r\n')).toBe(true);
		expect(body).toContain('VERSION:2.0');
		expect(body).toContain('CALSCALE:GREGORIAN');
		expect(body).not.toContain('\n\r');
	});

	it.each([
		['Soccer Practice!', 'soccer-practice'],
		['  Mom & Dad 30th  ', 'mom-dad-30th'],
		['###', 'event']
	])('slugifies %j', (title, expected) => {
		expect(icsFilename(title)).toBe(`${expected}.ics`);
	});
});

describe('buildGoogleCalendarUrl', () => {
	it('carries the RRULE and the viewer ctz', () => {
		const url = buildGoogleCalendarUrl({
			id: 'evt12345678901',
			title: 'Soccer practice',
			start: '2026-09-10T18:00:00.000Z',
			end: '2026-09-10T19:30:00.000Z',
			allDay: false,
			timeZone: 'America/Los_Angeles',
			recurrence: {
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceByDay: ['TH'],
				recurrenceCount: null,
				recurrenceUntil: null
			}
		});
		expect(url).toContain('action=TEMPLATE');
		expect(url).toContain('recur=RRULE%3AFREQ%3DWEEKLY%3BBYDAY%3DTH');
		expect(url).toContain('ctz=America%2FLos_Angeles');
		expect(url).toContain('dates=20260910T180000Z%2F20260910T193000Z');
	});
});

describe('parseIcs', () => {
	it('parses a simple timed event', () => {
		const events = parseIcs(
			ics([
				'BEGIN:VCALENDAR',
				'BEGIN:VEVENT',
				'SUMMARY:Soccer practice',
				'DTSTART:20260822T140000Z',
				'DTEND:20260822T153000Z',
				'LOCATION:Riverside Park',
				'END:VEVENT',
				'END:VCALENDAR'
			])
		);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			title: 'Soccer practice',
			startIso: '2026-08-22T14:00:00.000Z',
			endIso: '2026-08-22T15:30:00.000Z',
			allDay: false,
			location: 'Riverside Park'
		});
	});

	it('unfolds continuation lines', () => {
		const events = parseIcs(
			ics([
				'BEGIN:VEVENT',
				'SUMMARY:Family reunion',
				'DESCRIPTION:Bring chairs\\, snacks and',
				'  games for the kids. Meet at pavilion.',
				'DTSTART:20260905T170000Z',
				'END:VEVENT'
			])
		);
		expect(events[0]?.description).toContain('Bring chairs, snacks and games for the kids.');
	});

	it('parses VALUE=DATE as all-day and stores the exclusive DTEND as inclusive end-of-day', () => {
		const allDay = parseIcs(
			ics([
				'BEGIN:VEVENT',
				'SUMMARY:Two day trip',
				'DTSTART;VALUE=DATE:20260710',
				'DTEND;VALUE=DATE:20260712',
				'END:VEVENT'
			])
		);
		expect(allDay[0]).toMatchObject({
			allDay: true,
			startIso: '2026-07-10T00:00:00.000Z',
			endIso: '2026-07-11T23:59:59.999Z'
		});
	});

	it.each([
		[
			'TZID=America/New_York converts to UTC',
			'DTSTART;TZID=America/New_York:20260801T180000',
			'DTEND;TZID=America/New_York:20260801T200000',
			'2026-08-01T22:00:00.000Z',
			'2026-08-02T00:00:00.000Z'
		],
		[
			'a quoted Outlook pseudo-TZID maps to a real IANA zone',
			'DTSTART;TZID="Eastern Standard Time":20260910T150000',
			'DTEND;TZID="Eastern Standard Time":20260910T170000',
			'2026-09-10T19:00:00.000Z',
			'2026-09-10T21:00:00.000Z'
		],
		[
			'a floating time is wall-clock UTC',
			'DTSTART:20260801T180000',
			'DTEND:20260801T200000',
			'2026-08-01T18:00:00.000Z',
			'2026-08-01T20:00:00.000Z'
		]
	])('%s', (_name, startLine, endLine, startIso, endIso) => {
		const events = parseIcs(ics(['BEGIN:VEVENT', 'SUMMARY:Thing', startLine, endLine, 'END:VEVENT']));
		expect(events[0]).toMatchObject({ startIso, endIso });
	});

	it('applies DURATION and defaults a missing end to one hour', () => {
		const duration = parseIcs(
			ics(['BEGIN:VEVENT', 'SUMMARY:Standup', 'DTSTART:20260824T093000Z', 'DURATION:PT15M', 'END:VEVENT'])
		);
		expect(duration[0]?.endIso).toBe('2026-08-24T09:45:00.000Z');
		const fallback = parseIcs(ics(['BEGIN:VEVENT', 'SUMMARY:Lunch', 'DTSTART:20260825T120000Z', 'END:VEVENT']));
		expect(fallback[0]?.endIso).toBe('2026-08-25T13:00:00.000Z');
	});

	it.each([
		['RRULE:FREQ=WEEKLY', 'weekly', 1],
		['RRULE:FREQ=DAILY', 'daily', 1],
		['RRULE:FREQ=MONTHLY;INTERVAL=2', 'monthly', 2],
		['RRULE:FREQ=YEARLY', 'yearly', 1],
		['RRULE:FREQ=WEEKLY;INTERVAL=3', 'weekly', 3],
		['RRULE:FREQ=SECONDLY;BYHOUR=5', null, null]
	])('maps %s', (rrule, frequency, interval) => {
		const events = parseIcs(
			ics(['BEGIN:VEVENT', 'SUMMARY:Chore', 'DTSTART:20260820T150000Z', rrule, 'END:VEVENT'])
		);
		expect(events[0]?.recurrenceFrequency).toBe(frequency);
		expect(events[0]?.recurrenceInterval).toBe(interval);
	});

	it('keeps a plain BYDAY list but drops the whole list when a day carries an ordinal (Q-045)', () => {
		const plain = parseIcs(
			ics([
				'BEGIN:VEVENT',
				'SUMMARY:ENGR 110',
				'DTSTART:20260824T130500Z',
				'RRULE:FREQ=WEEKLY;COUNT=76;BYDAY=MO,WE,FR',
				'END:VEVENT'
			])
		);
		expect(plain[0]?.recurrenceByDay).toEqual(['MO', 'WE', 'FR']);
		expect(plain[0]?.recurrenceCount).toBe(76);

		const ordinal = parseIcs(
			ics([
				'BEGIN:VEVENT',
				'SUMMARY:Club',
				'DTSTART:20260824T130500Z',
				'RRULE:FREQ=WEEKLY;BYDAY=2TU,TH',
				'END:VEVENT'
			])
		);
		expect(ordinal[0]?.recurrenceByDay).toBeNull();
	});

	it('parses UNTIL in both forms', () => {
		const timestamp = parseIcs(
			ics([
				'BEGIN:VEVENT',
				'SUMMARY:Semester end',
				'DTSTART:20260824T130000Z',
				'RRULE:FREQ=WEEKLY;UNTIL=20261201T000000Z',
				'END:VEVENT'
			])
		);
		expect(timestamp[0]?.recurrenceUntil).toBe('2026-12-01T00:00:00.000Z');
		const dateOnly = parseIcs(
			ics([
				'BEGIN:VEVENT',
				'SUMMARY:All-day series',
				'DTSTART;VALUE=DATE:20260801',
				'RRULE:FREQ=DAILY;UNTIL=20260805',
				'END:VEVENT'
			])
		);
		expect(dateOnly[0]?.recurrenceUntil).toBe('2026-08-05T00:00:00.000Z');
	});

	it('skips CANCELLED rows and rows without SUMMARY or DTSTART', () => {
		expect(
			parseIcs(ics(['BEGIN:VEVENT', 'SUMMARY:Cancelled thing', 'STATUS:CANCELLED', 'DTSTART:20260820T150000Z', 'END:VEVENT']))
		).toHaveLength(0);
		expect(parseIcs(ics(['BEGIN:VEVENT', 'DTSTART:20260820T150000Z', 'END:VEVENT']))).toHaveLength(0);
		expect(parseIcs(ics(['BEGIN:VEVENT', 'SUMMARY:No start', 'END:VEVENT']))).toHaveLength(0);
	});

	it('cuts the title at 200 characters', () => {
		const events = parseIcs(
			ics(['BEGIN:VEVENT', `SUMMARY:${'x'.repeat(250)}`, 'DTSTART:20260820T150000Z', 'END:VEVENT'])
		);
		expect(events[0]?.title).toHaveLength(200);
	});

	it('stops at 500 VEVENTs', () => {
		const block = ['BEGIN:VEVENT', 'SUMMARY:Repeated', 'DTSTART:20260820T150000Z', 'END:VEVENT'];
		const events = parseIcs(Array.from({ length: 501 }, () => block.join('\r\n')).join('\r\n'));
		expect(MAX_ICS_EVENTS).toBe(500);
		expect(events).toHaveLength(MAX_ICS_EVENTS);
	});
});
