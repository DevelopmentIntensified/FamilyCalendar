/**
 * The claim book: every phrase family has exactly one owner (issues 112/114).
 * Carries `src/lib/server/services/parserClaimGuards.test.ts` (12 cases; the
 * bill rows are gone with Q-002).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { createClaimBook } from './parsing.claims.rules';
import { parseEventQuickAdd } from './parsing.event.rules';
import { parseTaskQuickAdd } from './parsing.task.rules';

/** Wed 15 Jul 2026, 14:30 UTC — a wired clock, not the host's. */
const CLOCK = new Date(Date.UTC(2026, 6, 15, 14, 30));

function parseEvent(input: string): ReturnType<typeof parseEventQuickAdd> {
	return parseEventQuickAdd(input, { now: CLOCK, zone: 'UTC' });
}

describe('claim book — a pure value', () => {
	it('records a span and masks it at its original offsets, keeping newlines', () => {
		const book = createClaimBook();
		expect(book.claim('monday', 7)).toBe(true);
		const masked = book.mask('dinner monday\nlunch');
		expect(masked).toHaveLength('dinner monday\nlunch'.length);
		expect(masked.slice(0, 7)).toBe('dinner ');
		expect(masked.slice(7, 13)).toBe('      ');
		expect(masked[13]).toBe('\n');
		expect(masked.slice(14)).toBe('lunch');
	});

	it('drops an overlapping claim, keeps a disjoint one', () => {
		const book = createClaimBook();
		expect(book.claim('monday', 0)).toBe(true);
		expect(book.claim('monday monday', 0)).toBe(false);
		expect(book.claim('monday', 7)).toBe(true);
		expect(book.spans).toEqual([
			{ start: 0, end: 6 },
			{ start: 7, end: 13 }
		]);
	});

	it('ignores a claim with no position or an empty span', () => {
		const book = createClaimBook();
		expect(book.claim('monday', undefined)).toBe(false);
		expect(book.claim('', 3)).toBe(false);
		expect(book.spans).toEqual([]);
		expect(book.mask('untouched')).toBe('untouched');
	});
});

describe('bare month-day rollover — one rule, one answer per phrase', () => {
	it('a numeric month-day rolls by the same rule as its month-name spelling', () => {
		const rows: Array<[string, string, string]> = [
			['numeric', 'reunion 7/15', '2026-07-15'],
			['named', 'reunion jul 15', '2026-07-15'],
			['named-first', 'reunion 15 jul', '2026-07-15'],
			['numeric', 'reunion 7/14', '2027-07-14'],
			['named', 'reunion jul 14', '2027-07-14'],
			['named-first', 'reunion 14 jul', '2027-07-14'],
			['numeric', 'reunion 7/16', '2026-07-16'],
			['named', 'reunion jul 16', '2026-07-16']
		];
		for (const [form, input, expected] of rows) {
			expect(parseEvent(input).parsed.date, `${form}: ${input}`).toBe(expected);
		}
	});

	it('jun/jul abbreviations are month-day phrases, not today — in every parser', () => {
		expect(parseEvent('reunion jul 14').parsed.date).toBe('2027-07-14');
		expect(parseEvent('reunion jun 3').parsed.date).toBe('2027-06-03');
		expect(parseEvent('reunion jun 16').parsed.date).toBe('2027-06-16');
		// The Task quick-add lands its due at end-of-day; compare the DAY.
		const task = parseTaskQuickAdd('submit form jul 14', { now: CLOCK, zone: 'UTC' });
		expect(task.dueDate).not.toBeNull();
		expect(task.dueDate).toBe('2027-07-14T23:59:00.000Z');
	});
});

describe('family disjointness inside the event parser', () => {
	it('the compact-time rule skips digit runs the date family claimed', () => {
		const both = parseEvent('standup 2026-08-30 1830');
		expect(both.parsed.date).toBe('2026-08-30');
		expect(both.parsed.startTime).toBe('18:30');

		const solo = parseEvent('dinner 2026-08-30');
		expect(solo.parsed.date).toBe('2026-08-30');
		expect(solo.parsed.startTime).toBeUndefined();
	});

	it('a place name stops at the day words the date family claims', () => {
		expect(parseEvent('meeting at the annex this friday at 2pm').parsed.location).toBe('annex');
		expect(parseEvent('party at the annex that saturday').parsed.location).toBe('annex');
		expect(parseEvent('meeting at the annex on monday at 2pm').parsed.location).toBe('annex');
	});

	it('an address rule skips a month-day span the date family claimed', () => {
		const rows: Array<[string, string, string | undefined]> = [
			['digit-first', 'graduation on 5 May', undefined],
			['digit-first-year', 'graduation on 5 May 2027', undefined],
			['digit-first-mid', 'party on 12 May', undefined],
			['month-first', 'graduation on May 5', undefined],
			['digit-first-beside-place', 'graduation on 5 May at the park', 'park']
		];
		for (const [form, input, expected] of rows) {
			expect(parseEvent(input).parsed.location, `${form}: ${input}`).toBe(expected);
		}
	});

	it("an 'at my …' read stops at a month-day claim, keeps real street reads", () => {
		expect(parseEvent('party at my cabin on 5 May').parsed.location).toBe('Cabin');
		expect(parseEvent('party at my apartment on 42 Maple Drive').parsed.location).toBe(
			'42 Maple Drive'
		);
	});

	it('a weekly scan does not re-claim the weekday of a date rule', () => {
		const rows: Array<[string, string, string | undefined, string[] | undefined]> = [
			['ordinal-first', 'first friday of october and every monday ride', '2026-10-02', ['MO']],
			['ordinal-rev', 'every monday and the first friday of october', '2026-10-02', ['MO']],
			['relative-first', 'party this friday every monday', '2026-07-17', ['MO']],
			['plural-weekly', 'weekly dinner friday', '2026-07-17', ['FR']],
			['bare-day', 'dinner friday', '2026-07-17', undefined]
		];
		for (const [form, input, date, byDay] of rows) {
			const parsed = parseEvent(input).parsed;
			expect(parsed.date, `${form}: ${input}`).toBe(date);
			expect(parsed.recurringByDay, `${form}: ${input}`).toEqual(byDay);
		}
	});

	it('military time skips claimed digit runs in either word order', () => {
		for (const input of ['standup 2026-08-30 1830', 'standup 1830 2026-08-30']) {
			const parsed = parseEvent(input).parsed;
			expect(parsed.date).toBe('2026-08-30');
			expect(parsed.startTime).toBe('18:30');
		}
	});

	it('an invite does not swallow a claimed date beside its name', () => {
		const rows: Array<[string, string, string[]]> = [
			['date-after', 'party invite jane jul 4', ['jane']],
			['date-before', 'party invite jul 4 jane', ['jane']],
			['month-first', 'party invite jane may 5', ['jane']],
			['floor', 'party invite jane and mo', ['jane', 'mo']]
		];
		for (const [form, input, expected] of rows) {
			expect(parseEvent(input).parsed.attendants, `${form}: ${input}`).toEqual(expected);
		}
	});

	it('calendar routing stays clean beside a claimed date (floor)', () => {
		for (const input of [
			'party on jul 4 family calendar',
			'party next may family calendar',
			'party today on the family calendar'
		]) {
			expect(parseEvent(input).parsed.calendarName, input).toBe('family calendar');
		}
	});
});
