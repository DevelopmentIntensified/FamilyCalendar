/**
 * Multi-event segmentation. Traced from `:2038-2197`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { isScheduleOnlyTitle, segmentEventInput } from './parsing.event-segment.rules';
import { parseEventQuickAddList } from './parsing.event.rules';

/** Wed 15 Jul 2026, 14:30 UTC. */
const NOW = new Date(Date.UTC(2026, 6, 15, 14, 30));

function parsedList(input: string): ReturnType<typeof parseEventQuickAddList> {
	return parseEventQuickAddList(input, { now: NOW, zone: 'UTC' });
}

describe('segmentEventInput', () => {
	it('splits semicolons and newlines first', () => {
		expect(segmentEventInput('dinner friday; movie saturday')).toEqual([
			'dinner friday',
			'movie saturday'
		]);
		expect(segmentEventInput('dinner friday\nmovie saturday')).toEqual([
			'dinner friday',
			'movie saturday'
		]);
	});

	it('splits commas only when every part carries a signal', () => {
		expect(segmentEventInput('dinner Friday, movie Saturday')).toEqual([
			'dinner Friday',
			'movie Saturday'
		]);
		expect(segmentEventInput('Buy milk, eggs')).toEqual(['Buy milk, eggs']);
		expect(segmentEventInput('Sept 5, 2026 party')).toEqual(['Sept 5, 2026 party']);
	});

	it('splits "and" only when both halves carry a signal', () => {
		expect(segmentEventInput('dinner Friday and movie Saturday')).toEqual([
			'dinner Friday',
			'movie Saturday'
		]);
		expect(segmentEventInput('fish and chips Friday')).toEqual(['fish and chips Friday']);
		expect(segmentEventInput('dinner Friday and movie')).toEqual(['dinner Friday and movie']);
	});

	it('vetoes a weekday pair, a date chain and a with-list', () => {
		expect(segmentEventInput('on Tuesday and Thursday')).toEqual(['on Tuesday and Thursday']);
		expect(segmentEventInput('today and tomorrow')).toEqual(['today and tomorrow']);
		expect(segmentEventInput('dinner with james and joseph friday')).toEqual([
			'dinner with james and joseph friday'
		]);
	});
});

describe('parseEventQuickAddList', () => {
	it('answers one entry for a single event', () => {
		const results = parsedList('dinner friday');
		expect(results).toHaveLength(1);
		expect(results[0].parsed.title).toBe('dinner');
	});

	it('splits an "and" list into two dated results', () => {
		const results = parsedList('dinner Friday and movie Saturday');
		expect(results.map((r) => r.parsed.title)).toEqual(['dinner', 'movie']);
		expect(results.map((r) => r.parsed.date)).toEqual(['2026-07-17', '2026-07-18']);
	});

	it('splits a semicolon list into three dated results', () => {
		const results = parsedList('dinner friday; movie saturday; brunch sunday');
		expect(results).toHaveLength(3);
		expect(results.map((r) => r.parsed.date)).toEqual([
			'2026-07-17',
			'2026-07-18',
			'2026-07-19'
		]);
	});

	it('a schedule-only continuation inherits the head title', () => {
		const results = parsedList('dinner friday; from 5:30-9pm');
		expect(results).toHaveLength(2);
		expect(results[1].parsed.title).toBe('dinner');
		expect(results[1].parsed.startTime).toBe('17:30');
		// "9pm" is the END hour: the short-range rule applies the meridiem as
		// written, so the end is 21:00 (naturalLanguageService.ts:972-989;
		// the sibling "movie 5:30-9pm" row in parsing.event.rules.test.ts).
		expect(results[1].parsed.endTime).toBe('21:00');
	});

	it('fewer than two segments clearing the gate answers the single parse', () => {
		const results = parsedList('movie');
		expect(results).toHaveLength(1);
	});
});

describe('isScheduleOnlyTitle', () => {
	it.each(['friday from 5:30-9pm', 'on monday at 6pm', '', undefined])(
		'%s is schedule only',
		(title) => {
			expect(isScheduleOnlyTitle(title)).toBe(true);
		}
	);

	it('any real word keeps its own title', () => {
		expect(isScheduleOnlyTitle('movie saturday')).toBe(false);
	});
});
