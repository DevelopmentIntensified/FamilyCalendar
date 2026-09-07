import { describe, it, expect } from 'vitest';
import {
	buildIcsEvent,
	buildIcsCalendar,
	buildRrule,
	buildGoogleCalendarUrl,
	escapeIcsText,
	icsFilename,
	type IcsEventInput,
	type IcsRecurrence,
	type GoogleCalendarInput
} from './ics';

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
			rec({
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 2,
				recurrenceByDay: ['MO', 'WE']
			}),
			'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'
		],
		[
			'daily with count',
			rec({ recurrenceFrequency: 'daily', recurrenceInterval: 1, recurrenceCount: 10 }),
			'FREQ=DAILY;COUNT=10'
		],
		[
			'monthly with UNTIL beats COUNT (RFC: exactly one of COUNT/UNTIL)',
			rec({
				recurrenceFrequency: 'monthly',
				recurrenceInterval: 1,
				recurrenceCount: 5,
				recurrenceUntil: '2027-01-31T23:59:59.000Z'
			}),
			'FREQ=MONTHLY;UNTIL=20270131T235959Z'
		],
		[
			'yearly, interval implied 1 omitted',
			rec({ recurrenceFrequency: 'yearly', recurrenceInterval: 1 }),
			'FREQ=YEARLY'
		],
		[
			'unknown frequency → no RRULE',
			rec({ recurrenceFrequency: 'sometimes', recurrenceInterval: 1 }),
			null
		]
	])('%s', (_name, r, expected) => {
		expect(buildRrule(r)).toBe(expected);
	});

	it('null frequency → null', () => {
		expect(buildRrule(rec())).toBeNull();
	});
});

describe('buildIcsEvent', () => {
	const base: IcsEventInput = {
		id: 'evt12345678901',
		title: 'Soccer practice',
		start: '2026-09-10T18:00:00.000Z',
		end: '2026-09-10T19:30:00.000Z',
		allDay: false,
		description: null,
		location: null,
		recurrence: null
	};

	it('timed event: UTC Z-form instants, UID, DTSTAMP, SUMMARY', () => {
		const lines = buildIcsEvent(base);
		expect(lines).toContain('BEGIN:VEVENT');
		expect(lines).toContain(`UID:${base.id}@familyplanz.com`);
		expect(lines).toContain('DTSTART:20260910T180000Z');
		expect(lines).toContain('DTEND:20260910T193000Z');
		expect(lines).toContain('SUMMARY:Soccer practice');
		expect(lines).toContain('END:VEVENT');
		const stamp = lines.find((l) => l.startsWith('DTSTAMP:'));
		expect(stamp).toMatch(/^DTSTAMP:\d{8}T\d{6}Z$/);
	});

	it('all-day event: DTSTART/DTEND as VALUE=DATE, DTEND exclusive', () => {
		const lines = buildIcsEvent({ ...base, allDay: true, end: '2026-09-12T23:59:59.999Z' });
		expect(lines).toContain('DTSTART;VALUE=DATE:20260910');
		// Stored end is inclusive end-of-day → DTEND is the next day.
		expect(lines).toContain('DTEND;VALUE=DATE:20260913');
	});

	it('all-day without end defaults to one day', () => {
		const lines = buildIcsEvent({ ...base, allDay: true, end: null });
		expect(lines).toContain('DTSTART;VALUE=DATE:20260910');
		expect(lines).toContain('DTEND;VALUE=DATE:20260911');
	});

	it('timed without end defaults to one hour', () => {
		const lines = buildIcsEvent({ ...base, end: null });
		expect(lines).toContain('DTSTART:20260910T180000Z');
		expect(lines).toContain('DTEND:20260910T190000Z');
	});

	it('escapes and omits empty text fields', () => {
		const lines = buildIcsEvent({
			...base,
			title: 'Notes, part 1; part 2',
			description: 'Bring:\n- water',
			location: null
		});
		expect(lines).toContain('SUMMARY:Notes\\, part 1\\; part 2');
		expect(lines).toContain('DESCRIPTION:Bring:\\n- water');
		expect(lines.some((l) => l.startsWith('LOCATION:'))).toBe(false);
	});

	it('includes LOCATION when present', () => {
		const lines = buildIcsEvent({ ...base, location: 'Field 3' });
		expect(lines).toContain('LOCATION:Field 3');
	});

	it('recurring event passes the RRULE through', () => {
		const lines = buildIcsEvent({
			...base,
			recurrence: {
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceByDay: ['TH'],
				recurrenceCount: null,
				recurrenceUntil: null
			}
		});
		expect(lines).toContain('RRULE:FREQ=WEEKLY;BYDAY=TH');
	});

	it('scope-this exception instance: exports its own fields, no RRULE', () => {
		const lines = buildIcsEvent({
			id: 'evt12345678901',
			title: 'Soccer practice (moved)',
			start: '2026-09-11T18:00:00.000Z',
			end: '2026-09-11T19:30:00.000Z',
			allDay: false,
			description: 'Moved a day later',
			location: 'Field 9',
			recurrence: null
		});
		expect(lines).toContain('DTSTART:20260911T180000Z');
		expect(lines).toContain('SUMMARY:Soccer practice (moved)');
		expect(lines).toContain('LOCATION:Field 9');
		expect(lines.some((l) => l.startsWith('RRULE:'))).toBe(false);
	});

	it('Date inputs are accepted alongside ISO strings', () => {
		const lines = buildIcsEvent({ ...base, start: new Date('2026-09-10T18:00:00.000Z') });
		expect(lines).toContain('DTSTART:20260910T180000Z');
	});
});

describe('buildIcsCalendar', () => {
	it('wraps VEVENTs in a CRLF-delimited VCALENDAR', () => {
		const body = buildIcsCalendar([
			['BEGIN:VEVENT', 'UID:a@x', 'END:VEVENT'],
			['BEGIN:VEVENT', 'UID:b@x', 'END:VEVENT']
		]);
		expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(body.endsWith('\r\nEND:VCALENDAR\r\n')).toBe(true);
		expect(body).toContain('VERSION:2.0');
		expect(body).toContain('CALSCALE:GREGORIAN');
		expect(body).toContain('UID:a@x\r\n');
		expect(body).not.toContain('\n\r');
	});
});

describe('icsFilename', () => {
	it.each([
		['Soccer Practice!', 'soccer-practice'],
		['  Mom & Dad 30th  ', 'mom-dad-30th'],
		['###', 'event']
	])('slugifies %j', (title, expected) => {
		expect(icsFilename(title)).toBe(`${expected}.ics`);
	});
});

describe('buildGoogleCalendarUrl', () => {
	const base: GoogleCalendarInput = {
		id: 'evt12345678901',
		title: 'Dentist',
		start: '2026-09-10T15:00:00.000Z',
		end: '2026-09-10T16:00:00.000Z',
		allDay: false,
		description: 'Cleaning',
		location: 'Main St',
		recurrence: null
	};

	it('encodes text/dates/details/location', () => {
		const url = buildGoogleCalendarUrl(base);
		expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
		const params = new URL(url).searchParams;
		expect(params.get('action')).toBe('TEMPLATE');
		expect(params.get('text')).toBe('Dentist');
		expect(params.get('dates')).toBe('20260910T150000Z/20260910T160000Z');
		expect(params.get('details')).toBe('Cleaning');
		expect(params.get('location')).toBe('Main St');
		expect(params.get('recur')).toBeNull();
		expect(params.get('ctz')).toBeNull();
	});

	it('all-day: date-only range, exclusive end', () => {
		const url = buildGoogleCalendarUrl({
			...base,
			allDay: true,
			start: '2026-09-10T00:00:00.000Z',
			end: '2026-09-11T23:59:59.999Z'
		});
		expect(new URL(url).searchParams.get('dates')).toBe('20260910/20260912');
	});

	it('recurring events include the URL-encoded RRULE', () => {
		const url = buildGoogleCalendarUrl({
			...base,
			recurrence: {
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceByDay: ['TH'],
				recurrenceCount: null,
				recurrenceUntil: null
			}
		});
		const recur = new URL(url).searchParams.get('recur');
		expect(recur).toBe('RRULE:FREQ=WEEKLY;BYDAY=TH');
	});

	it('ctz is included when the viewer zone is known', () => {
		const url = buildGoogleCalendarUrl({ ...base, timeZone: 'America/New_York' });
		expect(new URL(url).searchParams.get('ctz')).toBe('America/New_York');
	});
});
