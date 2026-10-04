import { describe, it, expect } from 'vitest';
import { parseEventInput, parseBillQuickAdd } from '$lib/server/services/naturalLanguageService';
import { parseTaskQuickAdd } from './taskQuickAdd';
import { MONTH_FULL } from './dateVocab';
import {
	daysInMonth,
	matchCadence,
	resolveMonthDay,
	valueToCadence,
	type CalendarDate
} from './dateResolution';

/**
 * PARITY: one shared phrase, one shared answer, all three parsers (issue 114).
 *
 * Three parsers resolve "a phrase → a due date and a cadence": task quick-add
 * (client), the event parser and the bill parser (server). They disagreed —
 * two answers for "sept 1", three cadence vocabularies — because `dateVocab`
 * held tokens and every parser re-implemented resolution. `dateResolution`
 * now owns the rules; this file is the proof they all call it, so a new
 * phrase lands in every parser the day it is added to one table.
 *
 * Each parser's answer is normalised to the shared `Cadence` shape before
 * comparison: the parsers disagree about *surface* (task quick-add returns
 * frequency + interval, the two server parsers return a wire value), and this
 * is where that surface difference stops mattering.
 */

/** Fixed clock for the client parser, which takes an injectable `now`. */
const CLOCK = new Date(2026, 2, 15); // Sat 15 Mar 2026, local
const CLOCK_CAL: CalendarDate = { year: 2026, month: 3, day: 15 };

/** The real clock, read in UTC — the zone both server parsers are handed. */
function utcNow(): CalendarDate {
	const now = new Date();
	return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}

/** `yyyy-MM-dd` in the local zone, from an instant. */
function localIso(instant: Date): string {
	const y = instant.getFullYear();
	const m = String(instant.getMonth() + 1).padStart(2, '0');
	const d = String(instant.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

function iso(date: CalendarDate): string {
	return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// The cadence vocabulary — every parser knows the same phrases
// ---------------------------------------------------------------------------

const CADENCE_PHRASES: string[] = [
	'every other day',
	'every other week',
	'every other month',
	'every other year',
	'Every Other Week',
	'every day',
	'every 2 days',
	'every 3 weeks',
	'every 10 days',
	'every 6 months',
	'every 2 yrs',
	'every 2 wks',
	'every 3 mos',
	'quarterly',
	'Quarterly',
	'every quarter',
	'per quarter',
	'biannually',
	'bi-annually',
	'semiannually',
	'twice a year',
	'daily',
	'nightly',
	'weekly',
	'monthly',
	'yearly',
	'annually',
	'repeats weekly',
	'repeat every week',
	'repeats daily',
	'repeat monthly',
	'repeats annually',
	'repeat every 3 days'
];

describe('cadence parity — the shared phrase table, all three parsers', () => {
	it.each(CADENCE_PHRASES)('"%s" is a cadence in the shared table', (phrase) => {
		expect(matchCadence(phrase), phrase).not.toBeNull();
	});

	it.each(CADENCE_PHRASES)('task quick-add resolves "%s" to the shared cadence', (phrase) => {
		const r = parseTaskQuickAdd(`water plants ${phrase}`, { now: CLOCK });
		const base = r.recurrenceFrequency ? valueToCadence(r.recurrenceFrequency) : null;
		expect(base, `quick-add found no cadence in "${phrase}"`).not.toBeNull();
		expect({ ...base!, every: r.recurrenceInterval ?? 1 }, phrase).toEqual(matchCadence(phrase)!.cadence);
	});

	it.each(CADENCE_PHRASES)('the event parser resolves "%s" to the shared cadence', (phrase) => {
		const recurring = parseEventInput(`trash pickup ${phrase}`, 'UTC').parsed.recurring;
		expect(valueToCadence(recurring ?? ''), `event parser found no cadence in "${phrase}"`).toEqual(
			matchCadence(phrase)!.cadence
		);
	});

	it.each(CADENCE_PHRASES)('the bill parser resolves "%s" to the shared cadence', (phrase) => {
		const recurring = parseBillQuickAdd(`hoa dues 250 ${phrase}`, 'UTC').recurring;
		expect(valueToCadence(recurring ?? ''), `bill parser found no cadence in "${phrase}"`).toEqual(
			matchCadence(phrase)!.cadence
		);
	});

	it('the cadence phrase is stripped from the title, so it cannot read as words', () => {
		for (const phrase of ['quarterly', 'every other week', 'repeats monthly', 'twice a year']) {
			const task = parseTaskQuickAdd(`hoa dues ${phrase}`, { now: CLOCK });
			expect(task.title.toLowerCase(), phrase).not.toContain(
				matchCadence(phrase)!.cadence.unit.slice(0, 4)
			);
			const eventTitle = parseEventInput(`hoa dues ${phrase}`, 'UTC').parsed.title;
			expect((eventTitle ?? '').toLowerCase(), phrase).not.toMatch(
				/quarter|every|repeat|twice|annually|bi-?annual|semiannual/
			);
			expect(parseBillQuickAdd(`hoa dues 250 ${phrase}`, 'UTC').title, phrase).not.toMatch(
				/quarter|every|repeat|twice|annually|bi-?annual|semiannual/
			);
		}
	});
});

// ---------------------------------------------------------------------------
// The rollover decision — one rule, all three parsers
// ---------------------------------------------------------------------------

interface RolloverRow {
	what: string;
	month: number;
	day: number;
	year: number | null;
}

/**
 * Rows are built from the clock so they keep discriminating whatever "today"
 * is. Two rows collapse on the 1st of a month ("yesterday" becomes "today")
 * — the reference is computed from the same clock, so the assertion still
 * tests the rule, only the label reads a day ahead of itself.
 */
function rolloverRows(now: CalendarDate): RolloverRow[] {
	const lastOfMonth = daysInMonth(now.year, now.month);
	return [
		{ what: "today's own date", month: now.month, day: now.day, year: null },
		{ what: 'a day already passed this month', month: now.month, day: Math.max(1, now.day - 1), year: null },
		{ what: 'later this month', month: now.month, day: Math.min(lastOfMonth, now.day + 5), year: null },
		{ what: 'a month already passed', month: now.month === 1 ? 12 : now.month - 1, day: 5, year: null },
		{
			what: 'a month still ahead',
			month: now.month === 12 ? 1 : now.month + 1,
			day: Math.min(now.day, daysInMonth(now.year, now.month === 12 ? 1 : now.month + 1)),
			year: null
		},
		{ what: 'a day no month has ("feb 30")', month: 2, day: 30, year: null },
		{ what: 'an explicit year in the past', month: now.month, day: now.day, year: now.year - 1 }
	];
}

function phrase(row: RolloverRow): string {
	return `${MONTH_FULL[row.month - 1]} ${row.day}${row.year === null ? '' : ` ${row.year}`}`;
}

describe('rollover parity — the one rule, all three parsers', () => {
	it.each(rolloverRows(CLOCK_CAL))(
		'task quick-add resolves $what by the shared rule',
		(row) => {
			const r = parseTaskQuickAdd(`pay rent ${phrase(row)}`, { now: CLOCK });
			const expected = resolveMonthDay(CLOCK_CAL, row.month, row.day, row.year);
			expect(expected, `${phrase(row)} cannot name a date`).not.toBeNull();
			expect(r.dueDate, `${phrase(row)} resolved no due date`).not.toBeNull();
			expect(localIso(new Date(r.dueDate!))).toBe(iso(expected!));
		}
	);

	it.each(rolloverRows(utcNow()))(
		'the event parser resolves $what by the shared rule',
		(row) => {
			const now = utcNow();
			const expected = resolveMonthDay(now, row.month, row.day, row.year);
			expect(expected, `${phrase(row)} cannot name a date`).not.toBeNull();
			const date = parseEventInput(`pay rent ${phrase(row)}`, 'UTC').parsed.date;
			expect(date, `${phrase(row)} resolved no date`).toBeTruthy();
			expect(date!.slice(0, 10)).toBe(iso(expected!));
		}
	);

	it.each(rolloverRows(utcNow()))(
		'the bill parser resolves $what by the shared rule',
		(row) => {
			const now = utcNow();
			const expected = resolveMonthDay(now, row.month, row.day, row.year);
			expect(expected, `${phrase(row)} cannot name a date`).not.toBeNull();
			expect(parseBillQuickAdd(`plumber $150 due ${phrase(row)}`, 'UTC').dueDate).toBe(iso(expected!));
		}
	);

	it('typing today is today, in every parser — not a year out', () => {
		const now = utcNow();
		const today = `${MONTH_FULL[now.month - 1]} ${now.day}`;
		expect(parseEventInput(`pay rent ${today}`, 'UTC').parsed.date?.slice(0, 10)).toBe(iso(now));
		expect(parseBillQuickAdd(`plumber $150 due ${today}`, 'UTC').dueDate).toBe(iso(now));
		const clock = new Date(2026, 2, 15);
		expect(parseTaskQuickAdd(`pay rent march 15`, { now: clock }).dueDate).not.toBeNull();
		expect(localIso(new Date(parseTaskQuickAdd(`pay rent march 15`, { now: clock }).dueDate!))).toBe(
			'2026-03-15'
		);
	});

	it('a bare month-day rolls the same way in all three — the "sept 1" that used to differ', () => {
		const now = utcNow();
		const row: RolloverRow = { what: 'sept 1', month: 9, day: 1, year: null };
		const expected = resolveMonthDay(now, row.month, row.day, row.year);
		expect(parseEventInput('pay rent sept 1', 'UTC').parsed.date?.slice(0, 10)).toBe(iso(expected!));
		expect(parseBillQuickAdd('plumber $150 due sept 1', 'UTC').dueDate).toBe(iso(expected!));
		// The client parser, read off a clock where sept 1 has already passed.
		const sept = new Date(2026, 9, 15); // 15 Oct 2026
		expect(localIso(new Date(parseTaskQuickAdd('pay rent sept 1', { now: sept }).dueDate!))).toBe(
			iso(resolveMonthDay({ year: 2026, month: 10, day: 15 }, 9, 1, null)!)
		);
	});
});

describe('a cadence means the same shape in every parser', () => {
	it('every 2 weeks is weekly x 2, whichever parser and whichever value word', () => {
		// The old drift: one parser said "biweekly", another "every_2_weeks",
		// the client had no spelling at all. Same cadence, three spellings.
		expect(valueToCadence('biweekly')).toEqual({ unit: 'week', every: 2 });
		expect(valueToCadence('every_2_weeks')).toEqual({ unit: 'week', every: 2 });
		expect(parseEventInput('payday every 2 weeks', 'UTC').parsed.recurring).toBe('biweekly');
		expect(parseBillQuickAdd('payday 100 every 2 weeks', 'UTC').recurring).toBe('biweekly');
		const task = parseTaskQuickAdd('payday every 2 weeks', { now: CLOCK });
		expect([task.recurrenceFrequency, task.recurrenceInterval]).toEqual(['weekly', 2]);
	});

	it('quarterly is monthly x 3, in every parser', () => {
		expect(parseEventInput('hoa dues quarterly', 'UTC').parsed.recurring).toBe('every_3_months');
		const bill = parseBillQuickAdd('hoa dues 250 quarterly', 'UTC');
		expect([bill.recurring, bill.frequency, bill.interval]).toEqual([
			'every_3_months',
			'monthly',
			3
		]);
		const task = parseTaskQuickAdd('hoa dues quarterly', { now: CLOCK });
		expect([task.recurrenceFrequency, task.recurrenceInterval]).toEqual(['monthly', 3]);
	});

	it('every other day is NOT weekly — the old "every other day" ⇒ biweekly bug', () => {
		expect(parseEventInput('take pills every other day', 'UTC').parsed.recurring).toBe('every_2_days');
		const task = parseTaskQuickAdd('take pills every other day', { now: CLOCK });
		expect([task.recurrenceFrequency, task.recurrenceInterval]).toEqual(['daily', 2]);
	});
});