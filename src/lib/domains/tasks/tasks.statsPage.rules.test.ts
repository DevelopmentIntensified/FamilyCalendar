import { describe, it, expect } from 'vitest';
import {
	taskAssignedVsDone,
	taskAssignmentBars,
	taskCompletedDayLabel,
	taskMonthLabel,
	taskWeekCells
} from './tasks.statsPage.rules';

/**
 * The approved stats prototype draws a seven-square week grid in the streak
 * hero, scales the two assignment lists into bars, and pairs every "assigned
 * to" count with the "done by" count beside it. These are the shapes the page
 * renders (legacy `statsPageModel.test.ts`, carried over with the same values).
 */

describe('taskWeekCells', () => {
	// Wednesday 2026-09-30. Its ISO week is 2026-W40.
	const today = '2026-09-30T08:00:00.000Z';

	it('draws seven weeks, oldest first, ending on today', () => {
		const cells = taskWeekCells([], today);
		expect(cells).toHaveLength(7);
		expect(cells.map((cell) => cell.label)).toEqual(['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7']);
		expect(cells[6]?.isCurrent).toBe(true);
		expect(cells.slice(0, 6).every((cell) => !cell.isCurrent)).toBe(true);
	});

	it('walks backwards one ISO week at a time', () => {
		const cells = taskWeekCells([], today);
		expect(cells[0]?.key).toBe('2026-W34');
		expect(cells[6]?.key).toBe('2026-W40');
	});

	it('marks the week a completion landed in', () => {
		// 2026-09-28 is a Monday, so 2026-W40; 2026-09-21 is 2026-W39.
		const cells = taskWeekCells(
			['2026-09-28T18:04:00.000Z', '2026-09-21T18:04:00.000Z'],
			today
		);
		expect(cells[6]?.hit).toBe(true);
		expect(cells[5]?.hit).toBe(true);
		expect(cells[4]?.hit).toBe(false);
	});

	it('counts one completion per week however many landed in it', () => {
		const cells = taskWeekCells(
			['2026-09-28T18:04:00.000Z', '2026-09-29T08:00:00.000Z', '2026-09-30T08:00:00.000Z'],
			today
		);
		expect(cells.filter((cell) => cell.hit)).toHaveLength(1);
	});

	it('ignores rows it cannot date rather than failing the hero', () => {
		const cells = taskWeekCells(['not-a-date', ''], today);
		expect(cells).toHaveLength(7);
		expect(cells.some((cell) => cell.hit)).toBe(false);
	});
});

describe('taskAssignmentBars', () => {
	it('scales every bar against the largest count', () => {
		const bars = taskAssignmentBars([
			{ name: 'Jon', total: 14 },
			{ name: 'Sarah', total: 7 },
			{ name: 'Mia', total: 0 }
		]);
		expect(bars.map((bar) => bar.pct)).toEqual([100, 50, 0]);
	});

	it('gives every bar zero width when nothing has a count yet', () => {
		// No rows is an empty state the page handles; rows all zero is the
		// "assigned, nobody" case and must not divide by zero.
		expect(taskAssignmentBars([])).toEqual([]);
		expect(taskAssignmentBars([{ name: 'Jon', total: 0 }]).map((bar) => bar.pct)).toEqual([0]);
	});

	it('rounds to whole percent so the bar width is a real CSS length', () => {
		const bars = taskAssignmentBars([
			{ name: 'a', total: 3 },
			{ name: 'b', total: 1 }
		]);
		expect(bars.map((bar) => bar.pct)).toEqual([100, 33]);
	});
});

describe('taskAssignedVsDone', () => {
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
		const rows = taskAssignedVsDone({ assigned, done, roster });
		expect(rows).toEqual([
			{ name: 'Jon', assigned: 14, done: 12, isChild: false },
			{ name: 'Sarah', assigned: 9, done: 9, isChild: false },
			{ name: 'Mia', assigned: 4, done: 0, isChild: true },
			{ name: 'Eli', assigned: 3, done: 0, isChild: true }
		]);
	});

	it('keeps someone who only ever completed something', () => {
		// A user with no assignments can still be the actor on a completion.
		const rows = taskAssignedVsDone({
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
		const rows = taskAssignedVsDone({ assigned, done, roster: [] });
		expect(rows.every((row) => !row.isChild)).toBe(true);
	});

	it('finds the children the argument card is about', () => {
		const rows = taskAssignedVsDone({ assigned, done, roster });
		expect(rows.filter((row) => row.isChild).map((row) => row.name)).toEqual(['Mia', 'Eli']);
	});
});

describe('taskMonthLabel', () => {
	it('names the month the numbers are counted over', () => {
		expect(taskMonthLabel('2026-09-30T08:00:00.000Z')).toMatch(/september 2026/i);
	});

	it('says no month rather than inventing one from a bad instant', () => {
		expect(taskMonthLabel('nonsense')).toBeNull();
	});
});

describe('taskCompletedDayLabel', () => {
	it('prints the day and the short month', () => {
		expect(taskCompletedDayLabel('2026-09-29T18:04:00.000Z')).toBe('Sep 29');
	});

	it('prints nothing for a missing or unparseable stamp', () => {
		expect(taskCompletedDayLabel(null)).toBe('');
		expect(taskCompletedDayLabel('nope')).toBe('');
	});
});
