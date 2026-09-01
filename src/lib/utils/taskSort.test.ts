import { describe, it, expect } from 'vitest';
import { sortByCompletedDesc, sortTasks } from './taskSort';

interface T {
	title: string;
	dueDate?: string | null;
	createdAt?: string;
	priority?: string | null;
	completedAt?: string;
}

const DAY = 86400000;

describe('sortTasks — due', () => {
	it('overdue pinned first, then soonest, undated last', () => {
		const overdue: T = { title: 'a', dueDate: new Date(Date.now() - 3 * DAY).toISOString() };
		const soon: T = { title: 'b', dueDate: new Date(Date.now() + 1 * DAY).toISOString() };
		const later: T = { title: 'c', dueDate: new Date(Date.now() + 9 * DAY).toISOString() };
		const undated: T = { title: 'd' };
		const sorted = [undated, later, soon, overdue].sort((x, y) => sortTasks(x, y, 'due'));
		expect(sorted.map((x) => x.title)).toEqual(['a', 'b', 'c', 'd']);
	});
});

describe('sortTasks — priority', () => {
	it('high → normal → low (missing priority counts as normal)', () => {
		const low: T = { title: 'low', priority: 'low' };
		const high: T = { title: 'high', priority: 'high' };
		const normal: T = { title: 'norm', priority: 'normal' };
		const none: T = { title: 'none' };
		// 'none' is a tie with 'normal' (missing = normal), so results are
		// order-stable: both rank between 'high' and 'low'.
		const sorted = [low, normal, none, high].sort((x, y) => sortTasks(x, y, 'priority'));
		expect(sorted.map((x) => x.title)).toEqual(['high', 'norm', 'none', 'low']);
	});
});

describe('sortTasks — title', () => {
	it('case-insensitive A–Z', () => {
		const sorted = [{ title: 'Beta' }, { title: 'alpha' }, { title: 'Gamma' }].sort((x, y) =>
			sortTasks(x, y, 'title')
		);
		expect(sorted.map((x) => x.title)).toEqual(['alpha', 'Beta', 'Gamma']);
	});
});

describe('sortTasks — created', () => {
	it('newest first', () => {
		const older: T = { title: 'old', createdAt: '2026-08-01T10:00:00.000Z' };
		const newer: T = { title: 'new', createdAt: '2026-08-28T10:00:00.000Z' };
		const sorted = [older, newer].sort((x, y) => sortTasks(x, y, 'created'));
		expect(sorted.map((x) => x.title)).toEqual(['new', 'old']);
	});
});

describe('sortByCompletedDesc', () => {
	it('most recently completed first', () => {
		const a: T = { title: 'a', completedAt: '2026-08-01T10:00:00.000Z' };
		const b: T = { title: 'b', completedAt: '2026-08-28T10:00:00.000Z' };
		const sorted = [a, b].sort(sortByCompletedDesc);
		expect(sorted.map((x) => x.title)).toEqual(['b', 'a']);
	});
});