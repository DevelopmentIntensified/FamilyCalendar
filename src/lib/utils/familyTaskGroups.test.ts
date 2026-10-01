import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { boardOwnerId, groupTasksByAssignee } from './familyTaskGroups';

/** A fixed local "now" (2026-09-30, 10:00). */
const NOW = new Date(2026, 8, 30, 10, 0, 0);

function localIso(days: number, hour = 9): string {
	const d = new Date(NOW);
	d.setDate(d.getDate() + days);
	d.setHours(hour, 0, 0, 0);
	return d.toISOString();
}

interface Row {
	id: string;
	title: string;
	dueDate: string | null;
	completedAt: string | null;
	assignedTo: string | null;
	userId: string;
}

const BASE: Row = {
	id: 't1',
	title: 'Task',
	dueDate: null,
	completedAt: null,
	assignedTo: null,
	userId: 'u_mom'
};

function task(overrides: Partial<Row> = {}): Row {
	return { ...BASE, ...overrides };
}

/** A roster member with nothing assigned gets no column — the map proves it. */
const ROSTER = new Map([
	['u_mom', 'Maya Lopez'],
	['u_dad', 'Sam Smith'],
	['u_eli', 'Eli Smith']
]);

const nameFor = (id: string) => ROSTER.get(id) ?? id;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('boardOwnerId', () => {
	it('is the assignee when there is one', () => {
		expect(boardOwnerId(task({ assignedTo: 'u_dad' }))).toBe('u_dad');
	});

	it('falls back to the creator when the Task is unassigned', () => {
		expect(boardOwnerId(task({ assignedTo: null }))).toBe('u_mom');
		expect(boardOwnerId(task({ assignedTo: undefined }))).toBe('u_mom');
	});
});

describe('groupTasksByAssignee', () => {
	it('puts each Task under its assignee', () => {
		const groups = groupTasksByAssignee(
			[
				task({ id: 'a', title: 'Mow the lawn', assignedTo: 'u_dad' }),
				task({ id: 'b', title: 'Book the vet', assignedTo: 'u_mom', userId: 'u_dad' })
			],
			nameFor
		);
		expect(groups.map((g) => g.ownerId)).toEqual(['u_mom', 'u_dad']);
		expect(groups[0].name).toBe('Maya Lopez');
		expect(groups[0].tasks.map((t) => t.title)).toEqual(['Book the vet']);
		expect(groups[1].name).toBe('Sam Smith');
		expect(groups[1].tasks.map((t) => t.title)).toEqual(['Mow the lawn']);
	});

	it('files an unassigned Task under the person who created it', () => {
		const groups = groupTasksByAssignee(
			[task({ id: 'a', title: 'Unclaimed', assignedTo: null, userId: 'u_dad' })],
			nameFor
		);
		expect(groups).toHaveLength(1);
		expect(groups[0].ownerId).toBe('u_dad');
		expect(groups[0].name).toBe('Sam Smith');
		expect(groups[0].tasks.map((t) => t.title)).toEqual(['Unclaimed']);
	});

	it('gives a family member with nothing assigned no column at all', () => {
		const groups = groupTasksByAssignee(
			[task({ id: 'a', assignedTo: 'u_mom' }), task({ id: 'b', assignedTo: 'u_dad' })],
			nameFor
		);
		// u_eli is on the roster and has nothing; no empty column is invented.
		expect(groups.map((g) => g.ownerId).sort()).toEqual(['u_dad', 'u_mom']);
		expect(groups.some((g) => g.ownerId === 'u_eli')).toBe(false);
		expect(groups.some((g) => g.tasks.length === 0)).toBe(false);
	});

	it('counts only that person’s open Tasks beside their name', () => {
		const groups = groupTasksByAssignee(
			[
				task({ id: 'a', assignedTo: 'u_mom' }),
				task({ id: 'b', assignedTo: 'u_mom' }),
				task({ id: 'c', assignedTo: 'u_dad' })
			],
			nameFor
		);
		expect(groups.map((g) => [g.ownerId, g.tasks.length])).toEqual([
			['u_mom', 2],
			['u_dad', 1]
		]);
	});

	it('sorts the viewer first, then everyone else by name', () => {
		const groups = groupTasksByAssignee(
			[
				task({ id: 'a', assignedTo: 'u_dad' }),
				task({ id: 'b', assignedTo: 'u_eli' }),
				task({ id: 'c', assignedTo: 'u_mom' })
			],
			nameFor,
			'u_eli'
		);
		expect(groups.map((g) => g.name)).toEqual(['Eli Smith', 'Maya Lopez', 'Sam Smith']);
	});

	it('puts the most overdue Task at the top of a column, by date', () => {
		const groups = groupTasksByAssignee(
			[
				task({ id: 'a', title: 'later', dueDate: localIso(2) }),
				task({ id: 'b', title: 'undated' }),
				task({ id: 'c', title: 'overdue by a week', dueDate: localIso(-7) }),
				task({ id: 'd', title: 'overdue by a day', dueDate: localIso(-1) }),
				task({ id: 'e', title: 'today', dueDate: localIso(0, 18) })
			],
			nameFor
		);
		expect(groups[0].tasks.map((t) => t.title)).toEqual([
			'overdue by a week',
			'overdue by a day',
			'today',
			'later',
			'undated'
		]);
	});

	it('returns nothing for a family with no open Tasks', () => {
		expect(groupTasksByAssignee([], nameFor)).toEqual([]);
	});
});
