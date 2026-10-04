import { describe, it, expect } from 'vitest';
import {
	recentWeekCells,
	assignmentBars,
	assignedVsDone,
	monthCompletionLabel
} from './statsPageModel';

/**
 * 093 rerun: the approved stats prototype draws a seven-square week grid in the
 * streak hero, scales the two assignment lists into bars, and pairs every
 * "assigned to" count with the "done by" count beside it. These are the three
 * shapes the page now renders.
 */

describe('recentWeekCells', () => {
	// Wednesday 2026-09-30. Its ISO week is 2026-W40.
	const today = '2026-09-30T08:00:00.000Z';

	it('draws seven weeks, oldest first, ending on today', () => {
		const cells = recentWeekCells([], today);
		expect(cells).toHaveLength(7);
		expect(cells.map((c) => c.label)).toEqual(['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7']);
		expect(cells[6].isCurrent).toBe(true);
		expect(cells.slice(0, 6).every((c) => !c.isCurrent)).toBe(true);
	});

	it('walks backwards one ISO week at a time', () => {
		const cells = recentWeekCells([], today);
		expect(cells[0].key).toBe('2026-W34');
		expect(cells[6].key).toBe('2026-W40');
	});

	it('marks the week a completion landed in', () => {
		// 2026-09-28 is a Monday, so 2026-W40; 2026-09-21 is 2026-W39.
		const cells = recentWeekCells(
			['2026-09-28T18:04:00.000Z', '2026-09-21T18:04:00.000Z'],
			today
		);
		expect(cells[6].hit).toBe(true);
		expect(cells[5].hit).toBe(true);
		expect(cells[4].hit).toBe(false);
	});

	it('counts one completion per week however many landed in it', () => {
		const cells = recentWeekCells(
			['2026-09-28T18:04:00.000Z', '2026-09-29T08:00:00.000Z', '2026-09-30T08:00:00.000Z'],
			today
		);
		expect(cells.filter((c) => c.hit)).toHaveLength(1);
	});

	it('ignores rows it cannot date rather than failing the hero', () => {
		const cells = recentWeekCells(['not-a-date', ''], today);
		expect(cells).toHaveLength(7);
		expect(cells.some((c) => c.hit)).toBe(false);
	});
});

describe('assignmentBars', () => {
	it('scales every bar against the largest count', () => {
		const bars = assignmentBars([
			{ name: 'Jon', total: 14 },
			{ name: 'Sarah', total: 7 },
			{ name: 'Mia', total: 0 }
		]);
		expect(bars.map((b) => b.pct)).toEqual([100, 50, 0]);
	});

	it('gives every bar full width when nothing has a count yet', () => {
		// No rows is an empty state the page handles; no rows all zero is the
		// "assigned, nobody" case and must not divide by zero.
		expect(assignmentBars([])).toEqual([]);
		expect(assignmentBars([{ name: 'Jon', total: 0 }]).map((b) => b.pct)).toEqual([0]);
	});

	it('rounds to whole percent so the bar width is a real CSS length', () => {
		const bars = assignmentBars([
			{ name: 'a', total: 3 },
			{ name: 'b', total: 1 }
		]);
		expect(bars.map((b) => b.pct)).toEqual([100, 33]);
	});
});

describe('assignedVsDone', () => {
	const assigned = [
		{ name: 'Jon', total: 14 },
		{ name: 'Sarah', total: 9 },
		{ name: 'Mia', total: 4 },
		{ name: 'Eli', total: 3 }
	];
	const done = [
		{ name: 'Jon', count: 12 },
		{ name: 'Sarah', count: 9 }
	];
	const roster = [
		{ firstName: 'Jon', memberType: 'parent' },
		{ firstName: 'Sarah', memberType: 'parent' },
		{ firstName: 'Mia', memberType: 'child' },
		{ firstName: 'Eli', memberType: 'child' }
	];

	it('pairs each assignee with what they actually did', () => {
		const rows = assignedVsDone({ assigned, done, roster });
		expect(rows).toEqual([
			{ name: 'Jon', assigned: 14, done: 12, isChild: false },
			{ name: 'Sarah', assigned: 9, done: 9, isChild: false },
			{ name: 'Mia', assigned: 4, done: 0, isChild: true },
			{ name: 'Eli', assigned: 3, done: 0, isChild: true }
		]);
	});

	it('keeps someone who only ever completed something', () => {
		// A user with no assignments can still be the actor on a completion.
		const rows = assignedVsDone({
			assigned: [{ name: 'Jon', total: 1 }],
			done: [{ name: 'Ben', count: 2 }],
			roster: []
		});
		expect(rows).toEqual([
			{ name: 'Jon', assigned: 1, done: 0, isChild: false },
			{ name: 'Ben', assigned: 0, done: 2, isChild: false }
		]);
	});

	it('flags a child from the roster, not from a guess', () => {
		// No roster means the page cannot know, so nobody is called a child.
		const rows = assignedVsDone({ assigned, done, roster: [] });
		expect(rows.every((r) => !r.isChild)).toBe(true);
	});

	it('finds the children the argument card is about', () => {
		const rows = assignedVsDone({ assigned, done, roster });
		expect(rows.filter((r) => r.isChild).map((r) => r.name)).toEqual(['Mia', 'Eli']);
	});
});

describe('monthCompletionLabel', () => {
	it('names the month the numbers are counted over', () => {
		expect(monthCompletionLabel('2026-09-30T08:00:00.000Z')).toMatch(/september 2026/i);
	});

	it('says no month rather than inventing one from a bad instant', () => {
		expect(monthCompletionLabel('nonsense')).toBeNull();
	});
});