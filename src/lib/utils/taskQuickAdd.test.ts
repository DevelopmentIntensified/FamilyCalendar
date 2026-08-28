import { describe, it, expect } from 'vitest';
import { parseTaskQuickAdd } from './taskQuickAdd';

/**
 * Quick-add NLP — phrase table per AGENTS.md. Aggressively low on tolerance:
 * every distinct phrasing, word order, case and combination we can think of.
 *
 * `now` is injected (Fri 2026-08-28, 10:00 local) so weekday math is
 * deterministic regardless of the CI machine's timezone. Due-date assertions
 * compare LOCAL calendar dates, not ISO strings, so they hold in any zone.
 */
const NOW = new Date('2026-08-28T10:00:00.000Z'); // a Friday

/** Local midnight of a date — tz-proof way to compare "which day" a due lands on. */
function startOfLocalDay(d: Date): Date {
	const c = new Date(d);
	c.setHours(0, 0, 0, 0);
	return c;
}

function daysAfter(base: Date, n: number): Date {
	const c = new Date(base);
	c.setDate(c.getDate() + n);
	return startOfLocalDay(c);
}

function expectDue(result: { dueDate: string | null }, daysFromNow: number) {
	expect(result.dueDate).not.toBeNull();
	const due = new Date(result.dueDate!);
	expect(startOfLocalDay(due)).toEqual(daysAfter(NOW, daysFromNow));
	// Original parser pins the due time to end-of-day, local.
	expect(due.getHours()).toBe(23);
	expect(due.getMinutes()).toBe(59);
}

describe('parseTaskQuickAdd — due-date phrases (regression, inherited behavior)', () => {
	it('tomorrow', () => {
		const r = parseTaskQuickAdd('buy milk tomorrow', { now: NOW });
		expect(r.title).toBe('buy milk');
		expect(r.priority).toBe('normal');
		expectDue(r, 1);
	});

	it('weekday (explicit name)', () => {
		const r = parseTaskQuickAdd('clean gutters saturday', { now: NOW });
		expect(r.title).toBe('clean gutters');
		expectDue(r, 1); // Fri → Sat
	});

	it('abbreviated weekday', () => {
		const r = parseTaskQuickAdd('call mom mon', { now: NOW });
		expect(r.title).toBe('call mom');
		expectDue(r, 3); // Fri → Mon
	});

	it('today', () => {
		const r = parseTaskQuickAdd('call mom today', { now: NOW });
		expect(r.title).toBe('call mom');
		expectDue(r, 0);
	});

	it('weekday that is today rolls to next week', () => {
		const r = parseTaskQuickAdd('review budget friday', { now: NOW });
		expect(r.title).toBe('review budget');
		expectDue(r, 7);
	});

	it('no date keyword leaves title alone and dueDate null', () => {
		const r = parseTaskQuickAdd('plan homemade sushi', { now: NOW });
		expect(r.title).toBe('plan homemade sushi');
		expect(r.dueDate).toBeNull();
		expect(r.priority).toBe('normal');
	});
});

describe('parseTaskQuickAdd — priority keywords (new surface)', () => {
	const cases: { phrase: string; priority: 'low' | 'normal' | 'high'; expectTitle: string }[] = [
		// high, level-first
		{ phrase: 'high priority buy milk', priority: 'high', expectTitle: 'buy milk' },
		{ phrase: 'urgent call dentist', priority: 'high', expectTitle: 'call dentist' },
		{ phrase: 'asap pay the invoice', priority: 'high', expectTitle: 'pay the invoice' },
		// high, title / level-last
		{ phrase: 'buy milk high priority', priority: 'high', expectTitle: 'buy milk' },
		{ phrase: 'pay the invoice ASAP', priority: 'high', expectTitle: 'pay the invoice' },
		// high, colon form
		{ phrase: 'urgent: call dentist', priority: 'high', expectTitle: 'call dentist' },
		// high, "priority high" reversed word order
		{ phrase: 'priority high file taxes', priority: 'high', expectTitle: 'file taxes' },
		{ phrase: 'file taxes priority: high', priority: 'high', expectTitle: 'file taxes' },
		// high, hyphenated
		{ phrase: 'high-priority deploy build', priority: 'high', expectTitle: 'deploy build' },
		// low
		{ phrase: 'low priority tidy desk', priority: 'low', expectTitle: 'tidy desk' },
		{ phrase: 'tidy desk low priority', priority: 'low', expectTitle: 'tidy desk' },
		{ phrase: 'priority low water plants', priority: 'low', expectTitle: 'water plants' },
		{ phrase: 'water the plants priority: low', priority: 'low', expectTitle: 'water the plants' },
		{ phrase: 'file paperwork not urgent', priority: 'low', expectTitle: 'file paperwork' }
	];

	it.each(cases)('$phrase → "$expectTitle" ($priority)', ({ phrase, priority, expectTitle }) => {
		const r = parseTaskQuickAdd(phrase, { now: NOW });
		expect(r.title).toBe(expectTitle);
		expect(r.priority).toBe(priority);
		expect(r.dueDate).toBeNull();
	});

	it('no keyword defaults to normal', () => {
		expect(parseTaskQuickAdd('take out trash', { now: NOW }).priority).toBe('normal');
	});
});

describe('parseTaskQuickAdd — date + priority combined', () => {
	it('priority before the date keyword', () => {
		const r = parseTaskQuickAdd('buy milk high priority tomorrow', { now: NOW });
		expect(r.title).toBe('buy milk');
		expect(r.priority).toBe('high');
		expectDue(r, 1);
	});

	it('date keyword before the priority phrase', () => {
		const r = parseTaskQuickAdd('tomorrow high priority buy milk', { now: NOW });
		expect(r.title).toBe('buy milk');
		expect(r.priority).toBe('high');
		expectDue(r, 1);
	});

	it('low priority + weekday', () => {
		const r = parseTaskQuickAdd('clean gutters saturday low priority', { now: NOW });
		expect(r.title).toBe('clean gutters');
		expect(r.priority).toBe('low');
		expectDue(r, 1);
	});

	it('urgent + weekday', () => {
		const r = parseTaskQuickAdd('urgent friday file taxes', { now: NOW });
		expect(r.title).toBe('file taxes');
		expect(r.priority).toBe('high');
		expectDue(r, 7);
	});

	it('urgency marker in the middle of a title that also carries a date', () => {
		const r = parseTaskQuickAdd('call dentist asap on monday', { now: NOW });
		expect(r.title).toBe('call dentist on');
		expect(r.priority).toBe('high');
		expectDue(r, 3); // Fri → Mon
	});
});