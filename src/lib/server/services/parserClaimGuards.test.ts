import { afterEach, describe, expect, it, vi } from 'vitest';
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
