import { describe, it, expect } from 'vitest';
import {
	familyBoardOwnerId,
	groupFamilyBoard,
	type FamilyBoardRow
} from './tasks.board.rules';

/**
 * The Family Task Board's grouping: every case both surfaces pinned before the
 * consolidation (the Day Dashboard card's roster columns and the family
 * board's "no empty column"), plus the legacy `familyTaskGroups.test.ts` order.
 */

const NOW = new Date(2026, 10, 2, 12, 0, 0, 0);
const NAMES: Record<string, string> = {
	'user-me': 'Riley Chen',
	'user-mia': 'Mia Rivera',
	'user-zed': 'Zed Rivera',
	'user-gone': 'Gone Member'
};
const nameFor = (id: string) => NAMES[id] ?? id;

function boardRow(id: string, overrides: Partial<FamilyBoardRow> = {}): FamilyBoardRow {
	return {
		id,
		title: id,
		dueDate: null,
		completedAt: null,
		assignedTo: null,
		userId: 'user-me',
		...overrides
	};
}

describe('familyBoardOwnerId', () => {
	it('is the assignee when there is one', () => {
		expect(familyBoardOwnerId(boardRow('t', { assignedTo: 'user-mia' }))).toBe('user-mia');
	});

	it('falls back to the creator for an unassigned Task', () => {
		expect(familyBoardOwnerId(boardRow('t', { userId: 'user-mia' }))).toBe('user-mia');
	});
});

describe('groupFamilyBoard', () => {
	it('puts the viewer first, then the other members by name', () => {
		const columns = groupFamilyBoard(
			[
				boardRow('zeds', { assignedTo: 'user-zed', userId: 'user-zed' }),
				boardRow('mine', { assignedTo: 'user-me' }),
				boardRow('mias', { assignedTo: 'user-mia', userId: 'user-mia' })
			],
			{ viewerId: 'user-me', nameFor, now: NOW }
		);
		expect(columns.map((column) => column.ownerId)).toEqual(['user-me', 'user-mia', 'user-zed']);
		expect(columns.map((column) => column.name)).toEqual([
			'Riley Chen',
			'Mia Rivera',
			'Zed Rivera'
		]);
	});

	it('orders a column by urgency, the overdue Task first', () => {
		const columns = groupFamilyBoard(
			[
				boardRow('later', { assignedTo: 'user-me', dueDate: '2026-11-10T09:00:00.000Z' }),
				boardRow('late', { assignedTo: 'user-me', dueDate: '2026-10-28T09:00:00.000Z' })
			],
			{ viewerId: 'user-me', nameFor, now: NOW }
		);
		expect(columns[0]?.tasks.map((task) => task.id)).toEqual(['late', 'later']);
	});

	it('orders a column overdue → today → later → none, then earliest due, then title', () => {
		const columns = groupFamilyBoard(
			[
				boardRow('none-b', { assignedTo: 'user-me', title: 'B' }),
				boardRow('later', { assignedTo: 'user-me', dueDate: '2026-11-05T09:00:00.000Z' }),
				boardRow('none-a', { assignedTo: 'user-me', title: 'A' }),
				boardRow('today', { assignedTo: 'user-me', dueDate: '2026-11-02T18:00:00.000Z' }),
				boardRow('overdue', { assignedTo: 'user-me', dueDate: '2026-11-01T09:00:00.000Z' })
			],
			{ viewerId: 'user-me', nameFor, now: NOW }
		);
		expect(columns[0]?.tasks.map((task) => task.id)).toEqual([
			'overdue',
			'today',
			'later',
			'none-a',
			'none-b'
		]);
	});

	it('renders no column for a member with nothing assigned', () => {
		const columns = groupFamilyBoard([boardRow('t', { assignedTo: 'user-mia' })], {
			viewerId: 'user-me',
			nameFor,
			now: NOW
		});
		expect(columns.map((column) => column.ownerId)).toEqual(['user-mia']);
	});

	it('keeps a column for every roster member when the caller lists them', () => {
		const columns = groupFamilyBoard([], {
			rosterIds: ['user-mia', 'user-me', 'user-zed'],
			viewerId: 'user-me',
			nameFor,
			now: NOW
		});
		expect(columns.map((column) => [column.ownerId, column.name, column.tasks.length])).toEqual([
			['user-me', 'Riley Chen', 0],
			['user-mia', 'Mia Rivera', 0],
			['user-zed', 'Zed Rivera', 0]
		]);
	});

	it('falls back to the creator for an unassigned Task and keeps an ex-member column', () => {
		const columns = groupFamilyBoard(
			[
				boardRow('task-unassigned', { userId: 'user-mia' }),
				boardRow('task-gone', { userId: 'user-gone', assignedTo: 'user-gone' })
			],
			{ rosterIds: ['user-me', 'user-mia'], viewerId: 'user-me', nameFor, now: NOW }
		);
		expect(columns.map((column) => column.ownerId)).toEqual(['user-me', 'user-gone', 'user-mia']);
		expect(columns[2]?.tasks.map((task) => task.id)).toEqual(['task-unassigned']);
	});
});
