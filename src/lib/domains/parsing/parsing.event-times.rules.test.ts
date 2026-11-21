/**
 * Time ranges first, then single times, then end cues and durations.
 * Expected values are traced from the legacy rules (`:948-1608`).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { createEventTimeState, readEventTimeRanges, readEventTimes } from './parsing.event-times.rules';
import { createClaimBook } from './parsing.claims.rules';
import { parseEventQuickAdd } from './parsing.event.rules';

const NOW = new Date(Date.UTC(2026, 6, 15, 14, 30));

function parsed(input: string): ReturnType<typeof parseEventQuickAdd>['parsed'] {
	return parseEventQuickAdd(input, { now: NOW, zone: 'UTC' }).parsed;
}

describe('time ranges — matched before single times', () => {
	const rows: Array<[string, string, string]> = [
		['gym 5:30-6:30pm', '17:30', '18:30'],
		['gym 6:00PM - 8:00PM', '18:00', '20:00'],
		['class from 2-4pm', '14:00', '16:00'],
		// Legacy accident, pinned: the `from … to …` form is consumed by the
		// short-range rule first, whose start hour INHERITS the end meridiem —
		// `applyPeriod(9, 'pm')` is 21:00 (naturalLanguageService.ts:972-989 at
		// 66a11131). The later "from 9 AM to 5 PM" rule (`:1430-1450`) never
		// runs because this one already set `foundTime`.
		['shift from 9 to 5 pm', '21:00', '17:00'],
		['meeting between 2 and 4 PM', '14:00', '16:00'],
		['drinks 6-8pm', '18:00', '20:00'],
		['drinks 6 to 8pm', '18:00', '20:00'],
		['drinks 6–8pm', '18:00', '20:00']
	];

	it.each(rows)('%s → %s–%s', (phrase, start, end) => {
		const result = parsed(phrase);
		expect(result.startTime).toBe(start);
		expect(result.endTime).toBe(end);
	});

	it('a bare digit range without a meridiem never matches ("20-30 pages")', () => {
		const result = parsed('read 20-30 pages');
		expect(result.startTime).toBeUndefined();
		expect(result.endTime).toBeUndefined();
	});

	it('a missing start meridiem inherits the end one', () => {
		expect(parsed('gym 5:30-6:30pm').startTime).toBe('17:30');
	});

	it('reports range increments in rule order', () => {
		const times = createEventTimeState();
		expect(readEventTimeRanges('gym 5:30-6:30pm', [], times)).toEqual([0.2]);
		expect(times).toEqual({ startTime: '17:30', endTime: '18:30', foundTime: true });
	});
});

describe('single times', () => {
	const rows: Array<[string, string]> = [
		['meeting starting at 6 PM', '18:00'],
		['meet at 8 AM', '08:00'],
		['meeting at 2:30 PM', '14:30'],
		['standup 9:00 AM', '09:00'],
		['mon and tue 6am', '06:00'],
		['party at noon', '12:00'],
		['party at midnight', '00:00'],
		['hike at dusk', '20:00'],
		['hike at dawn', '06:00'],
		['meet at 8', '08:00'],
		['meet at 7', '19:00'],
		['half past seven pm', '19:30'],
		['quarter to nine am', '08:45'],
		['quarter past two pm', '14:15'],
		['standup 1830', '18:30'],
		['run early morning', '06:00'],
		['run in the evening', '18:00'],
		['kicking off at 5 PM', '17:00'],
		['leaving at 6 AM', '06:00'],
		['arriving at 10 AM', '10:00'],
		['store opening at 11 AM', '11:00'],
		['gym a5pm', '17:00'],
		['gym a 9pm', '21:00'],
		['meet 8:00 p.m.', '20:00']
	];

	it.each(rows)('%s → %s', (phrase, expected) => {
		expect(parsed(phrase).startTime).toBe(expected);
	});

	it('compact military time skips a year-shaped run', () => {
		expect(parsed('standup 2026-08-30 1830').startTime).toBe('18:30');
	});

	it('a clock inside a URL never sets a start time (Q-010 B)', () => {
		expect(parsed('standup https://meet.example.com/standup-5:30pm').startTime).toBeUndefined();
	});

	it('a stated time outside the URL still reads (Q-010 B)', () => {
		expect(parsed('https://meet.example.com/standup-5:30pm standup at 9am').startTime).toBe('09:00');
	});
});

describe('end cues', () => {
	const rows: Array<[string, string]> = [
		['party wrapping up around 9 PM', '21:00'],
		['party finishes around 11 AM', '11:00'],
		['movie going on until 9 PM', '21:00'],
		['camp staying until sunset', '20:00'],
		['party running late', '23:00'],
		['party going until we fall asleep', '23:00'],
		['party until midnight', '00:00'],
		['party ends at 9 PM', '21:00'],
		['shift till 5 PM', '17:00'],
		['returning by 2 PM', '14:00'],
		['store closing at 6 PM', '18:00']
	];

	it.each(rows)('%s → %s', (phrase, expected) => {
		expect(parsed(phrase).endTime).toBe(expected);
	});

	it('an end cue never overwrites a range end', () => {
		expect(parsed('gym 5:30-6:30pm, ending at 9 PM').endTime).toBe('18:30');
	});
});

describe('durations need a start and no end', () => {
	const rows: Array<[string, string]> = [
		['meeting at 3pm for 2 hours', '17:00'],
		['meeting at 3pm for 15 minutes', '15:15'],
		['meeting at 3pm about 30 min', '15:30'],
		['meeting at 3pm lasting 90 minutes', '16:30']
	];

	it.each(rows)('%s → %s', (phrase, expected) => {
		expect(parsed(phrase).endTime).toBe(expected);
	});

	it('a duration alone invents no end', () => {
		expect(parsed('meeting for 2 hours').endTime).toBeUndefined();
	});
});

describe('readEventTimes — state and increments', () => {
	it('a found start time gates the later start rules', () => {
		const times = createEventTimeState();
		const confidence = readEventTimes(
			'meet at 6 PM',
			createClaimBook(),
			[],
			times
		);
		expect(times.startTime).toBe('18:00');
		expect(times.foundTime).toBe(true);
		expect(confidence).toEqual([0.25]);
	});
});
