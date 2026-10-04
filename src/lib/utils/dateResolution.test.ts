import { describe, it, expect } from 'vitest';
import {
	CADENCE_FREQUENCIES,
	cadenceFrequency,
	cadenceToValue,
	cadenceUnit,
	daysInMonth,
	daysUntilWeekday,
	matchCadence,
	resolveMonthDay,
	valueToCadence,
	type Cadence,
	type CalendarDate
} from './dateResolution';

/**
 * Shared date + cadence RESOLUTION (issue 114).
 *
 * `dateVocab.ts` holds the tokens; this holds the RULES. Three parsers
 * resolve a phrase into a date and a cadence — task quick-add (client),
 * the event parser and the bill parser (both server) — and they drifted:
 * two answers for "sept 1", three cadence vocabularies. These tests pin
 * the rules ONCE, at the layer all three call.
 */

/** Sat 2026-03-15 (arbitrary; only the month/day relationship matters). */
const NOW: CalendarDate = { year: 2026, month: 3, day: 15 };

// ---------------------------------------------------------------------------
// The rollover rule — one answer, pinned here
// ---------------------------------------------------------------------------

describe('resolveMonthDay — the one rollover rule', () => {
	it('keeps a bare month-day still ahead this year', () => {
		expect(resolveMonthDay(NOW, 12, 25, null)).toEqual({ year: 2026, month: 12, day: 25 });
	});

	it('rolls a bare month-day that already passed to next year', () => {
		expect(resolveMonthDay(NOW, 1, 5, null)).toEqual({ year: 2027, month: 1, day: 5 });
	});

	it('keeps TODAY as today — typing the current date must not jump a year', () => {
		expect(resolveMonthDay(NOW, 3, 15, null)).toEqual({ year: 2026, month: 3, day: 15 });
	});

	it('an explicit year is authoritative, even in the past', () => {
		expect(resolveMonthDay(NOW, 1, 5, 2025)).toEqual({ year: 2025, month: 1, day: 5 });
	});

	it('clamps the day to a short month ("feb 30" is the 28th)', () => {
		expect(resolveMonthDay(NOW, 2, 30, null)).toEqual({ year: 2026, month: 2, day: 28 });
		expect(resolveMonthDay(NOW, 2, 30, 2028)).toEqual({ year: 2028, month: 2, day: 29 });
	});

	it('rejects an impossible month rather than inventing one', () => {
		expect(resolveMonthDay(NOW, 13, 1, null)).toBeNull();
		expect(resolveMonthDay(NOW, 0, 1, null)).toBeNull();
		expect(resolveMonthDay(NOW, 3, 0, null)).toBeNull();
		expect(resolveMonthDay(NOW, 3, 32, null)).toBeNull();
	});

	it('holds the rule across every day of a leap and a non-leap year', () => {
		for (const now of [
			{ year: 2026, month: 1, day: 1 },
			{ year: 2028, month: 2, day: 29 },
			{ year: 2027, month: 12, day: 31 }
		]) {
			expect(resolveMonthDay(now, now.month, now.day, null)).toEqual(now);
			expect(resolveMonthDay(now, now.month, now.day - 1 || 1, null)!.day).toBe(now.day - 1 || 1);
			const ahead = resolveMonthDay(now, now.month, now.day, null)!;
			expect(ahead.year).toBe(now.year);
		}
	});

	it('rejects a passed month-day past the clamp ceiling (day 31 in February)', () => {
		// Feb 31 can never exist; the clamp must land inside the target month.
		const resolved = resolveMonthDay({ year: 2026, month: 1, day: 20 }, 2, 31, null);
		expect(resolved).toEqual({ year: 2026, month: 2, day: 28 });
	});
});

describe('daysInMonth', () => {
	it.each([
		[2026, 1, 31],
		[2026, 2, 28],
		[2028, 2, 29],
		[1900, 2, 28],
		[2000, 2, 29],
		[2026, 4, 30]
	])('daysInMonth(%i, %i) === %i', (year, month, expected) => {
		expect(daysInMonth(year, month)).toBe(expected);
	});
});

describe('daysUntilWeekday — the one weekday rule', () => {
	it('is 0..6 days ahead, today itself rolling to 7 (next week)', () => {
		// Saturday = 0, matching JS Date.getDay().
		expect(daysUntilWeekday(0, 0)).toBe(7);
		expect(daysUntilWeekday(0, 1)).toBe(1);
		expect(daysUntilWeekday(0, 6)).toBe(6);
		expect(daysUntilWeekday(3, 5)).toBe(2);
		expect(daysUntilWeekday(5, 4)).toBe(6);
	});

	it('never returns 0 — a bare weekday is always a future occurrence', () => {
		for (let from = 0; from < 7; from += 1) {
			for (let to = 0; to < 7; to += 1) {
				expect(daysUntilWeekday(from, to)).toBeGreaterThan(0);
				expect(daysUntilWeekday(from, to)).toBeLessThanOrEqual(7);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// The cadence vocabulary — one set, one value grammar
// ---------------------------------------------------------------------------

describe('cadence value grammar', () => {
	const roundTrips: Array<{ cadence: Cadence; value: string }> = [
		{ cadence: { unit: 'day', every: 1 }, value: 'daily' },
		{ cadence: { unit: 'week', every: 1 }, value: 'weekly' },
		{ cadence: { unit: 'week', every: 2 }, value: 'biweekly' },
		{ cadence: { unit: 'month', every: 1 }, value: 'monthly' },
		{ cadence: { unit: 'month', every: 3 }, value: 'every_3_months' },
		{ cadence: { unit: 'month', every: 6 }, value: 'every_6_months' },
		{ cadence: { unit: 'year', every: 1 }, value: 'yearly' }
	];

	it.each(roundTrips)('$value ← $cadence', ({ cadence, value }) => {
		expect(cadenceToValue(cadence)).toBe(value);
	});

	it.each(roundTrips)('$cadence → $value', ({ cadence, value }) => {
		expect(valueToCadence(value)).toEqual(cadence);
	});

	it('every_2_days stays an every-N-unit rather than collapsing to biweekly', () => {
		expect(cadenceToValue({ unit: 'day', every: 2 })).toBe('every_2_days');
		expect(cadenceToValue({ unit: 'month', every: 2 })).toBe('every_2_months');
	});

	it('valueToCadence rejects values outside the vocabulary', () => {
		expect(valueToCadence('hourly')).toBeNull();
		expect(valueToCadence('every_0_days')).toBeNull();
		expect(valueToCadence('')).toBeNull();
	});

	it('cadenceFrequency collapses every-N onto the storage vocabulary', () => {
		expect(cadenceFrequency({ unit: 'day', every: 1 })).toBe('daily');
		expect(cadenceFrequency({ unit: 'week', every: 2 })).toBe('weekly');
		expect(cadenceFrequency({ unit: 'month', every: 3 })).toBe('monthly');
		expect(cadenceFrequency({ unit: 'year', every: 6 })).toBe('yearly');
		expect(CADENCE_FREQUENCIES).toEqual(['daily', 'weekly', 'monthly', 'yearly']);
	});
});

// ---------------------------------------------------------------------------
// The cadence phrase table — added once, lands in every parser
// ---------------------------------------------------------------------------

describe('matchCadence — the shared cadence phrase table', () => {
	const cases: [string, Cadence][] = [
		// every other
		['every other day', { unit: 'day', every: 2 }],
		['every other week', { unit: 'week', every: 2 }],
		['every other month', { unit: 'month', every: 2 }],
		['every other year', { unit: 'year', every: 2 }],
		['Every Other Week', { unit: 'week', every: 2 }],
		// every N
		['every day', { unit: 'day', every: 1 }],
		['every 2 days', { unit: 'day', every: 2 }],
		['every 3 weeks', { unit: 'week', every: 3 }],
		['every 10 days', { unit: 'day', every: 10 }],
		['every 6 months', { unit: 'month', every: 6 }],
		['every 1 year', { unit: 'year', every: 1 }],
		['every 2 yrs', { unit: 'year', every: 2 }],
		['every 2 wks', { unit: 'week', every: 2 }],
		['every 3 mos', { unit: 'month', every: 3 }],
		// quarterly / biannual
		['quarterly', { unit: 'month', every: 3 }],
		['Quarterly', { unit: 'month', every: 3 }],
		['every quarter', { unit: 'month', every: 3 }],
		['per quarter', { unit: 'month', every: 3 }],
		['/ quarter', { unit: 'month', every: 3 }],
		['quarterly dues', { unit: 'month', every: 3 }],
		['biannually', { unit: 'month', every: 6 }],
		['bi-annually', { unit: 'month', every: 6 }],
		['semiannually', { unit: 'month', every: 6 }],
		['semi-annually', { unit: 'month', every: 6 }],
		['twice a year', { unit: 'month', every: 6 }],
		// bare frequency words
		['daily', { unit: 'day', every: 1 }],
		['weekly', { unit: 'week', every: 1 }],
		['monthly', { unit: 'month', every: 1 }],
		['yearly', { unit: 'year', every: 1 }],
		['annually', { unit: 'year', every: 1 }],
		// repeat-verb forms (issue 030 span)
		['repeats weekly', { unit: 'week', every: 1 }],
		['repeat every week', { unit: 'week', every: 1 }],
		['repeats daily', { unit: 'day', every: 1 }],
		['repeat monthly', { unit: 'month', every: 1 }],
		['repeats annually', { unit: 'year', every: 1 }],
		['repeat every 3 days', { unit: 'day', every: 3 }]
	];

	it.each(cases)('%s', (phrase, expected) => {
		const hit = matchCadence(phrase);
		expect(hit, `no cadence matched in ${JSON.stringify(phrase)}`).not.toBeNull();
		expect(hit!.cadence).toEqual(expected);
	});

	const nonCadences = [
		'',
		'soccer practice',
		'every saturday',
		'every monday and wednesday',
		'once a month',
		'a week',
		'2 weeks',
		'in 3 days',
		'next week'
	];

	it.each(nonCadences)('%s yields no cadence', (phrase) => {
		expect(matchCadence(phrase)).toBeNull();
	});

	it('returns the matched span so callers strip exactly what they resolved', () => {
		expect(matchCadence('hoa dues 250 quarterly')?.match[0]).toBe('quarterly');
		expect(matchCadence('gym every other day')?.match[0]).toBe('every other day');
		expect(matchCadence('trash pickup every 2 weeks')?.match[0]).toBe('every 2 weeks');
		expect(matchCadence('repeat every week')?.match[0]).toBe('repeat every week');
	});

	it('specific phrase wins over the bare word it contains, in table order', () => {
		// "every 3 weeks" must not resolve as the bare "weeks" rule, and a
		// title carrying two cadences takes the table's first match — the
		// established semantic in all three parsers.
		expect(matchCadence('every 3 weeks')?.cadence.every).toBe(3);
		expect(matchCadence('every other week')?.cadence.every).toBe(2);
		expect(matchCadence('twice a year')?.cadence.every).toBe(6);
		expect(matchCadence('weekly and every 3 days')?.cadence).toEqual({ unit: 'day', every: 3 });
	});
});

describe('cadenceUnit — parsers resolve their own captures through it', () => {
	it.each([
		['day', 'day'],
		['days', 'day'],
		['Day', 'day'],
		['week', 'week'],
		['weeks', 'week'],
		['wk', 'week'],
		['wks', 'week'],
		['month', 'month'],
		['months', 'month'],
		['mo', 'month'],
		['mos', 'month'],
		['year', 'year'],
		['years', 'year'],
		['yr', 'year'],
		['yrs', 'year']
	])('cadenceUnit("%s") === %s', (token, expected) => {
		expect(cadenceUnit(token)).toBe(expected);
	});

	it.each(['', 'quarter', 'hour', 'fortnight', 'weekday', 's'])(
		'cadenceUnit(%j) is null — outside the unit vocabulary',
		(token) => {
			expect(cadenceUnit(token)).toBeNull();
		}
	);
});