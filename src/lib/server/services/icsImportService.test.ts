import { describe, it, expect } from 'vitest';
import { parseIcs } from './icsImportService';

describe('ICS Import Parser', () => {
	it('parses a simple timed event', () => {
		const ics = [
			'BEGIN:VCALENDAR',
			'BEGIN:VEVENT',
			'SUMMARY:Soccer practice',
			'DTSTART:20260822T140000Z',
			'DTEND:20260822T153000Z',
			'LOCATION:Riverside Park',
			'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n');
		const events = parseIcs(ics);
		expect(events).toHaveLength(1);
		expect(events[0].title).toBe('Soccer practice');
		expect(events[0].startIso).toBe('2026-08-22T14:00:00.000Z');
		expect(events[0].endIso).toBe('2026-08-22T15:30:00.000Z');
		expect(events[0].allDay).toBe(false);
		expect(events[0].location).toBe('Riverside Park');
	});

	it('unfolds continuation lines (long descriptions)', () => {
		const ics = [
			'BEGIN:VEVENT',
			'SUMMARY:Family reunion',
			'DESCRIPTION:Bring chairs\\, snacks and',
			'  games for the kids. Meet at pavilion.',
			'DTSTART:20260905T170000Z',
			'END:VEVENT'
		].join('\r\n');
		const events = parseIcs(ics);
		expect(events[0].description).toContain('Bring chairs, snacks and games for the kids.');
	});

	it('parses VALUE=DATE as all-day', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20261225', 'END:VEVENT'].join('\r\n');
		const events = parseIcs(ics);
		expect(events[0].allDay).toBe(true);
		expect(events[0].startIso).toBe('2026-12-25T00:00:00.000Z');
		expect(events[0].endIso).toBeNull();
	});

	it('maps DTEND date-only all-day end to exclusive next day', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:Two day trip', 'DTSTART;VALUE=DATE:20260710', 'DTEND;VALUE=DATE:20260712', 'END:VEVENT'].join('\r\n');
		const events = parseIcs(ics);
		// ICS DTEND is exclusive; we store inclusive end-of-day before it.
		expect(events[0].allDay).toBe(true);
		expect(events[0].startIso).toBe('2026-07-10T00:00:00.000Z');
		expect(events[0].endIso).toBe('2026-07-11T23:59:59.999Z');
	});

	it('converts TZID times from the IANA zone to UTC', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:Dinner', 'DTSTART;TZID=America/New_York:20260801T180000', 'DTEND;TZID=America/New_York:20260801T200000', 'END:VEVENT'].join('\r\n');
		const events = parseIcs(ics);
		// August is EDT (UTC-4), so 18:00 local = 22:00 UTC.
		expect(events[0].startIso).toBe('2026-08-01T22:00:00.000Z');
		expect(events[0].endIso).toBe('2026-08-02T00:00:00.000Z');
	});

	it('maps Outlook-style pseudo-TZIDs (quoted) to a real IANA zone', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:Class', 'DTSTART;TZID="Eastern Standard Time":20260910T150000', 'DTEND;TZID="Eastern Standard Time":20260910T170000', 'END:VEVENT'].join('\r\n');
		const events = parseIcs(ics);
		// September is EDT (UTC-4), despite the "Standard" name.
		expect(events[0].startIso).toBe('2026-09-10T19:00:00.000Z');
		expect(events[0].endIso).toBe('2026-09-10T21:00:00.000Z');
	});

	it('still treats floating (no TZID) times as wall-clock UTC', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:Floating', 'DTSTART:20260801T180000', 'DTEND:20260801T200000', 'END:VEVENT'].join('\r\n');
		const events = parseIcs(ics);
		expect(events[0].startIso).toBe('2026-08-01T18:00:00.000Z');
		expect(events[0].endIso).toBe('2026-08-01T20:00:00.000Z');
	});

	it('applies DURATION when DTEND is missing', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:Standup', 'DTSTART:20260824T093000Z', 'DURATION:PT15M', 'END:VEVENT'].join('\r\n');
		const events = parseIcs(ics);
		expect(events[0].endIso).toBe('2026-08-24T09:45:00.000Z');
	});

	it('defaults missing DTEND/DURATION to 1 hour', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:Lunch', 'DTSTART:20260825T120000Z', 'END:VEVENT'].join('\r\n');
		const events = parseIcs(ics);
		expect(events[0].endIso).toBe('2026-08-25T13:00:00.000Z');
	});

	it('maps RRULE FREQ/INTERVAL to recurrence fields', () => {
		const base = ['BEGIN:VEVENT', 'SUMMARY:Chore', 'DTSTART:20260820T150000Z'];
		const cases: [string, string | null, number | null][] = [
			['RRULE:FREQ=WEEKLY', 'weekly', 1],
			['RRULE:FREQ=DAILY', 'daily', 1],
			['RRULE:FREQ=MONTHLY;INTERVAL=2', 'monthly', 2],
			['RRULE:FREQ=YEARLY', 'yearly', 1],
			['RRULE:FREQ=WEEKLY;INTERVAL=3', 'weekly', 3],
			['RRULE:FREQ=SECONDLY;BYHOUR=5', null, null]
		];
		for (const [rrule, freq, interval] of cases) {
			const events = parseIcs([...base, rrule, 'END:VEVENT'].join('\r\n'));
			expect(events[0].recurrenceFrequency, rrule).toBe(freq);
			expect(events[0].recurrenceInterval, rrule).toBe(interval);
		}
	});

	it('parses RRULE BYDAY into a lowercase weekday set', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:ENGR 110', 'DTSTART:20260824T130500Z', 'RRULE:FREQ=WEEKLY;COUNT=76;BYDAY=MO,WE,FR', 'END:VEVENT'].join('\r\n');
		const events = parseIcs(ics);
		expect(events[0].recurrenceFrequency).toBe('weekly');
		expect(events[0].recurrenceByDay).toEqual(['MO', 'WE', 'FR']);
	});

	it('parses RRULE COUNT into recurrenceCount', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:CHEM lab', 'DTSTART:20260825T101500Z', 'RRULE:FREQ=WEEKLY;COUNT=16;BYDAY=TU', 'END:VEVENT'].join('\r\n');
		const events = parseIcs(ics);
		expect(events[0].recurrenceCount).toBe(16);
	});

	it('returns null BYDAY/COUNT/UNTIL when the RRULE has none', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:Chore', 'DTSTART:20260820T150000Z', 'RRULE:FREQ=WEEKLY', 'END:VEVENT'].join('\r\n');
		const events = parseIcs(ics);
		expect(events[0].recurrenceByDay).toBeNull();
		expect(events[0].recurrenceCount).toBeNull();
		expect(events[0].recurrenceUntil).toBeNull();
	});

	it('parses RRULE UNTIL (UTC datetime) into recurrenceUntil', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:Semester end', 'DTSTART:20260824T130000Z', 'RRULE:FREQ=WEEKLY;UNTIL=20261201T000000Z', 'END:VEVENT'].join('\r\n');
		const events = parseIcs(ics);
		expect(events[0].recurrenceUntil).toBe('2026-12-01T00:00:00.000Z');
	});

	it('parses RRULE UNTIL (date-only) into recurrenceUntil', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:All-day series', 'DTSTART;VALUE=DATE:20260801', 'RRULE:FREQ=DAILY;UNTIL=20260805', 'END:VEVENT'].join('\r\n');
		const events = parseIcs(ics);
		expect(events[0].recurrenceUntil).toBe('2026-08-05T00:00:00.000Z');
	});

	it('skips cancelled events', () => {
		const ics = ['BEGIN:VEVENT', 'SUMMARY:Cancelled thing', 'STATUS:CANCELLED', 'DTSTART:20260820T150000Z', 'END:VEVENT'].join('\r\n');
		expect(parseIcs(ics)).toHaveLength(0);
	});

	it('skips events without SUMMARY or DTSTART', () => {
		const ics = [
			'BEGIN:VEVENT',
			'DESCRIPTION:no summary here',
			'DTSTART:20260820T150000Z',
			'END:VEVENT',
			'BEGIN:VEVENT',
			'SUMMARY:no start date',
			'END:VEVENT'
		].join('\r\n');
		expect(parseIcs(ics)).toHaveLength(0);
	});

	it('parses multiple events and caps at 500', () => {
		const lines = ['BEGIN:VCALENDAR'];
		for (let i = 0; i < 600; i++) {
			lines.push(`BEGIN:VEVENT`, `SUMMARY:Event ${i}`, `DTSTART:202601${String((i % 28) + 1).padStart(2, '0')}T100000Z`, 'END:VEVENT');
		}
		lines.push('END:VCALENDAR');
		expect(parseIcs(lines.join('\r\n'))).toHaveLength(500);
	});
});
