/**
 * The date chain and the explicit-date sweep. Expected values are traced
 * from the legacy chain (`naturalLanguageService.ts:543-941`) against the
 * pinned clock Wed 15 Jul 2026, 14:30 UTC.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { ordinalWeekdayOfMonth, readEventDates } from './parsing.event-dates.rules';
import { createClaimBook } from './parsing.claims.rules';
import { parseEventQuickAdd } from './parsing.event.rules';

/** Wed 15 Jul 2026, 14:30 UTC. */
const NOW = new Date(Date.UTC(2026, 6, 15, 14, 30));

function parsed(input: string): ReturnType<typeof parseEventQuickAdd>['parsed'] {
	return parseEventQuickAdd(input, { now: NOW, zone: 'UTC' }).parsed;
}

function readDates(input: string): ReturnType<typeof readEventDates> {
	return readEventDates(input, DateTime.fromJSDate(NOW, { zone: 'UTC' }), createClaimBook(), []);
}

describe('date chain — first match wins', () => {
	const rows: Array<[string, string]> = [
		['meeting this Friday', '2026-07-17'],
		['meeting next Tuesday', '2026-07-28'],
		['meeting today', '2026-07-15'],
		['meeting tomorrow', '2026-07-16'],
		['meeting in 3 days', '2026-07-18'],
		['meeting in 2 weeks', '2026-07-29'],
		['meeting in a month', '2026-08-15'],
		['meeting this weekend', '2026-07-18'],
		['event next May', '2027-05-01'],
		['party on July 12th', '2027-07-12'],
		['festival May 4th', '2027-05-04'],
		['gala Dec 25, 2026', '2026-12-25'],
		['trip 21 Mar 2027', '2027-03-21'],
		['standup 2026-08-30', '2026-08-30'],
		['party 05/03', '2027-05-03'],
		['party 1st of January', '2027-01-01'],
		['meeting 2nd of February', '2027-02-02'],
		['event fourteenth of March', '2027-03-14'],
		['gala on the twenty-first of December', '2026-12-21'],
		['first Friday of October', '2026-10-02'],
		['deadline last Friday of the month', '2026-07-31']
	];

	it.each(rows)('%s → %s', (phrase, expected) => {
		expect(parsed(phrase).date).toBe(expected);
	});

	it('an explicit year wins even when it is in the past', () => {
		expect(parsed('reunion 12 Jan 2020').date).toBe('2020-01-12');
	});

	it('today stays today — a month-day naming today does not roll a year', () => {
		expect(parsed('reunion jul 15').date).toBe('2026-07-15');
		expect(parsed('reunion 7/15').date).toBe('2026-07-15');
	});

	it('a bare weekday is the next occurrence, never today', () => {
		expect(parsed('lunch wednesday').date).toBe('2026-07-22');
		expect(parsed('lunch thursday').date).toBe('2026-07-16');
	});

	it('"in 48hrs" lands the date and the wall clock', () => {
		const result = parsed('standup in 48hrs');
		expect(result.date).toBe('2026-07-17');
		expect(result.startTime).toBe('14:30');
	});

	it('"returning Sunday morning" anchors an end time', () => {
		// Legacy's `this <weekday>` rule (`:543-551`) consumes "this Sunday"
		// before the `returning …` rule (`:638-651`) can fire, so the daypart
		// only lands without the "this".
		const result = parsed('returning Sunday morning');
		expect(result.date).toBe('2026-07-19');
		expect(result.endTime).toBe('09:00');
	});

	// Q-009 B: an impossible MM/DD is unmatched, so the date falls back to
	// today — never the literal "Invalid DateTime".
	const impossibleNumericRows: string[] = ['party 31/12', 'party 13/13', 'party 00/10', 'party 05/32'];

	it.each(impossibleNumericRows)('%s falls back to today (Q-009 B)', (phrase) => {
		const result = parsed(phrase);
		expect(result.date).toBe('2026-07-15');
		expect(result.title).toBe(phrase);
	});
});

describe('date chain — the weekend rule', () => {
	it('a Saturday today means the NEXT Saturday', () => {
		const saturday = new Date(Date.UTC(2026, 6, 18, 10, 0));
		const result = parseEventQuickAdd('market this weekend', { now: saturday, zone: 'UTC' });
		expect(result.parsed.date).toBe('2026-07-25');
	});
});

describe('explicit-date sweep and chains', () => {
	it('collects every named date with continuations borrowing the month', () => {
		expect(parsed('book club sept 5, 12, and 19').dates).toEqual([
			'2026-09-05',
			'2026-09-12',
			'2026-09-19'
		]);
	});

	it('caps span expansion at five dates', () => {
		const result = parsed('party sept 1 and 2 and 3 and 4 and 5 and 6');
		expect(result.dates).toHaveLength(5);
		expect(result.dates).toEqual([
			'2026-09-01',
			'2026-09-02',
			'2026-09-03',
			'2026-09-04',
			'2026-09-05'
		]);
	});

	it('keeps the date when today and a literal name the SAME day', () => {
		const result = parsed('running today and jul 15');
		expect(result.dates).toEqual(['2026-07-15']);
		expect(result.date).toBe('2026-07-15');
	});

	it('a following colon marks a time, never a day continuation', () => {
		const result = parsed('sept 9, 08:00 am review');
		expect(result.dates).toBeUndefined();
		expect(result.startTime).toBe('08:00');
	});

	it('date = dates[0]', () => {
		const result = parsed('party sept 23 & 30');
		expect(result.date).toBe('2026-09-23');
		expect(result.dates).toEqual(['2026-09-23', '2026-09-30']);
	});
});

describe('ordinalWeekdayOfMonth', () => {
	it('returns null when the ordinal cannot exist', () => {
		// Feb 2026 has four Mondays (2, 9, 16, 23) — never a fifth.
		expect(ordinalWeekdayOfMonth(2026, 2, 1, 'fifth', 'UTC')).toBeNull();
	});

	it('last reads backwards from the end of the month', () => {
		expect(ordinalWeekdayOfMonth(2026, 7, 5, 'last', 'UTC')?.toFormat('yyyy-MM-dd')).toBe(
			'2026-07-31'
		);
	});
});

describe('readEventDates — spans and confidence', () => {
	it('claims the weekday it consumed so a later family cannot re-read it', () => {
		const book = createClaimBook();
		const spans: string[] = [];
		const reading = readEventDates(
			'party this friday at 5pm',
			DateTime.fromJSDate(NOW, { zone: 'UTC' }),
			book,
			spans
		);
		expect(reading.date).toBe('2026-07-17');
		expect(spans).toContain('this friday');
		expect(book.spans).toEqual([{ start: 6, end: 17 }]);
	});

	it('reports its increments in the order the chain earned them', () => {
		expect(readDates('party today at 5pm').confidence).toEqual([0.2]);
		expect(readDates('party 2026-08-30').confidence).toEqual([0.35]);
	});
});
