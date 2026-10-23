import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { parseBillQuickAdd, parseEventInput } from './naturalLanguageService';
import { parseTaskQuickAdd } from '$lib/utils/taskQuickAdd';

/**
 * CLAIM GUARDS — every phrase family has exactly one owner (issues 112/114).
 *
 * The parsers resolve phrases in a fixed order; when two rules can claim the
 * same text the later claim wins by order-of-grep instead of meaning. These
 * tables pin the disjointness contract:
 *
 *   - a bare month-day gets ONE rollover answer whatever spelling wrote it
 *     ("7/15", "jul 15", "15 jul" — and today stays today, all parsers);
 *   - a phrase one family already claimed is skipped by the next
 *     (compact time never reads the digits of an ISO date);
 *   - a place name stops where the date rule will claim ("at the annex
 *     this friday" → annex — the date family owns "this friday");
 *   - a cued numeric date ("water bill on 8/15") belongs to the due-date
 *     family, never to the amount family.
 */

// Wed 15 Jul 2026, 14:30 local — a wired clock, so the rollover rows keep
// discriminating whatever day the suite runs on.
const CLOCK = new Date(2026, 6, 15, 14, 30);
const CLOCK_TASK = CLOCK;

afterEach(() => {
	vi.useRealTimers();
});

function withClock() {
	vi.useFakeTimers();
	vi.setSystemTime(CLOCK);
}

describe('bare month-day rollover — one rule, one answer per phrase', () => {
	it('a numeric month-day rolls by the same rule as its month-name spelling', () => {
		withClock();
		const rows: Array<[string, string, string]> = [
			// Today's month-day — typed either way, today stays today.
			['numeric', 'reunion 7/15', '2026-07-15'],
			['named', 'reunion jul 15', '2026-07-15'],
			['named-first', 'reunion 15 jul', '2026-07-15'],
			// Yesterday's month-day — strictly before today rolls one year.
			['numeric', 'reunion 7/14', '2027-07-14'],
			['named', 'reunion jul 14', '2027-07-14'],
			['named-first', 'reunion 14 jul', '2027-07-14'],
			// Tomorrow — no roll either way.
			['numeric', 'reunion 7/16', '2026-07-16'],
			['named', 'reunion jul 16', '2026-07-16']
		];
		for (const [form, input, expected] of rows) {
			const result = parseEventInput(input);
			expect(result.parsed.date, `${form}: ${input}`).toBe(expected);
		}
	});

	it('jun/jul abbreviations are month-day phrases, not today — in every parser', () => {
		withClock();
		// "jul 14" and "jun 3" name dates (they roll like any past month-day);
		// every parser must answer the same, not "no date → today".
		expect(parseEventInput('reunion jul 14').parsed.date).toBe('2027-07-14');
		expect(parseEventInput('reunion jun 3').parsed.date).toBe('2027-06-03');
		// June 16 is also strictly before the July 15 clock → rolls.
		expect(parseEventInput('reunion jun 16').parsed.date).toBe('2027-06-16');
		expect(parseBillQuickAdd('water bill jul 14').dueDate).toBe('2027-07-14');
		// The task quick-add lands its due at end-of-day, rendered as a UTC
		// ISO — compare the LOCAL calendar day, not the string prefix.
		const task = parseTaskQuickAdd('submit form jul 14', { now: CLOCK_TASK });
		expect(task.dueDate).not.toBeNull();
		expect(new Date(task.dueDate!).toDateString()).toBe(new Date(2027, 6, 14).toDateString());
	});
});

describe('family disjointness inside the event parser', () => {
	it('the compact-time rule skips digit runs the date family claimed', () => {
		// The ISO date owns "2026-08-30"; the compact-time rule must skip the
		// year-shaped run and keep scanning, so a following "1830" is the time.
		const both = parseEventInput('standup 2026-08-30 1830');
		expect(both.parsed.date).toBe('2026-08-30');
		expect(both.parsed.startTime).toBe('18:30');

		// And an ISO date alone must not claim a time from its own digits.
		const solo = parseEventInput('dinner 2026-08-30');
		expect(solo.parsed.date).toBe('2026-08-30');
		expect(solo.parsed.startTime).toBeUndefined();
	});

	it('a place name stops at the day words the date family claims', () => {
		// "this"/"that" hand the sentence to the date rule exactly like
		// "next"/"last" do; the place reader must not walk through them.
		expect(parseEventInput('meeting at the annex this friday at 2pm').parsed.location).toBe(
			'annex'
		);
		expect(parseEventInput('party at the annex that saturday').parsed.location).toBe('annex');
		// Control: the 108 rule still reads plain places.
		expect(parseEventInput('meeting at the annex on monday at 2pm').parsed.location).toBe('annex');
	});
});

describe('the claim book — a rule cannot read text another family claimed', () => {
	// July clock (Wed 15 Jul 2026): the floor rows reuse the file's wired
	// clock, so "this friday" = 2026-07-17 and the ordinal October date does
	// not roll (still future).
	beforeEach(() => {
		withClock();
	});

	it('an address rule skips a month-day span the date family claimed', () => {
		// Digit-first word order: the month-day claim and the address capture
		// are the same text — the claim wins, "5 May" is not a location.
		// Month-first order is the control: the address rule never sees a
		// digit run there, so it never had the bug.
		const rows: Array<[string, string, string | undefined]> = [
			['digit-first', 'graduation on 5 May', undefined],
			['digit-first-year', 'graduation on 5 May 2027', undefined],
			['digit-first-mid', 'party on 12 May', undefined],
			['month-first', 'graduation on May 5', undefined],
			['digit-first-beside-place', 'graduation on 5 May at the park', 'park']
		];
		for (const [form, input, expected] of rows) {
			const parsed = parseEventInput(input).parsed;
			expect(parsed.location, `${form}: ${input}`).toBe(expected);
		}
	});

	it("an 'at my …' read stops at a month-day claim, keeps real street reads", () => {
		// "at my cabin on 5 May" names the cabin and the 5th of May — the
		// claimed date must not ride in as the location. The street form is
		// claimed by nobody and keeps its address.
		expect(parseEventInput('party at my cabin on 5 May').parsed.location).toBe('Cabin');
		expect(parseEventInput('party at my apartment on 42 Maple Drive').parsed.location).toBe(
			'42 Maple Drive'
		);
	});

	it('a weekly scan does not re-claim the weekday of a date rule', () => {
		// "first friday of october" and "this friday" are DATE claims; their
		// weekday words belong to the one-off date, not to the weekly list.
		// Bare weekday floors stay: "weekly dinner friday" is weekly [FR],
		// "dinner friday" is a single dated event.
		const rows: Array<[string, string, string | undefined, string[] | undefined]> = [
			['ordinal-first', 'first friday of october and every monday ride', '2026-10-02', ['MO']],
			['ordinal-rev', 'every monday and the first friday of october', '2026-10-02', ['MO']],
			['relative-first', 'party this friday every monday', '2026-07-17', ['MO']],
			['plural-weekly', 'weekly dinner friday', '2026-07-17', ['FR']],
			['bare-day', 'dinner friday', '2026-07-17', undefined]
		];
		for (const [form, input, date, byDay] of rows) {
			const parsed = parseEventInput(input).parsed;
			expect(parsed.date, `${form}: ${input}`).toBe(date);
			expect(parsed.recurringByDay, `${form}: ${input}`).toEqual(byDay);
		}
	});

	it('military time skips claimed digit runs in either word order', () => {
		for (const input of ['standup 2026-08-30 1830', 'standup 1830 2026-08-30']) {
			const parsed = parseEventInput(input).parsed;
			expect(parsed.date).toBe('2026-08-30');
			expect(parsed.startTime).toBe('18:30');
		}
	});

	it('an invite does not swallow a claimed date beside its name', () => {
		// The date claim leaves the sentence whether it sits after the name
		// or before it; the invite keeps exactly the names.
		const rows: Array<[string, string, string[]]> = [
			['date-after', 'party invite jane jul 4', ['jane']],
			['date-before', 'party invite jul 4 jane', ['jane']],
			['month-first', 'party invite jane may 5', ['jane']],
			['floor', 'party invite jane and mo', ['jane', 'mo']]
		];
		for (const [form, input, expected] of rows) {
			expect(parseEventInput(input).parsed.attendants, `${form}: ${input}`).toEqual(expected);
		}
	});

	it('calendar routing stays clean beside a claimed date (floor)', () => {
		// These were already green — pinned so the book never trades them away.
		for (const input of [
			'party on jul 4 family calendar',
			'party next may family calendar',
			'party today on the family calendar'
		]) {
			expect(parseEventInput(input).parsed.calendarName).toBe('family calendar');
		}
	});
});

describe('family disjointness inside the bill parser', () => {
	it('a cued numeric date belongs to the due-date family, not the amount family', () => {
		withClock();
		const cued = parseBillQuickAdd('water bill on 8/15');
		expect(cued.dueDate).toBe('2026-08-15');
		expect(cued.amountCents).toBeNull();
		expect(cued.title).toBe('water bill');
	});

	it('the amount family still gets its phrase beside the cued date', () => {
		withClock();
		const both = parseBillQuickAdd('water bill 40 on 8/15');
		expect(both.amountCents).toBe(4000);
		expect(both.dueDate).toBe('2026-08-15');
		expect(both.title).toBe('water bill');
	});
});
