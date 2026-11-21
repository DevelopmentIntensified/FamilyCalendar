/**
 * Pure board rules: which state the active tab renders, the viewer's pending
 * handoffs and the Public tab's label. Expected values are the legacy board
 * page (`src/routes/(family)/family/tasks/+page.svelte`) and README
 * Invariants 15-16.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	boardEmptyState,
	groupBoardColumns,
	pendingForViewer,
	publicTabLabel,
	windowCompletedTasks,
	type BoardEmptyFacts,
	type BoardEmptyState,
	type PendingTask
} from './familyHub.board.rules';
import { buildFamilyBoardTaskWire } from './familyHub.ui.fixtures';

const facts = (overrides: Partial<BoardEmptyFacts>): BoardEmptyFacts => ({
	tab: 'family',
	open: 0,
	completed: 0,
	publicCount: 0,
	tagFilter: '',
	...overrides
});

type EmptyCase = [string, BoardEmptyFacts, BoardEmptyState];

describe('boardEmptyState', () => {
	// Legacy `family/tasks/+page.svelte:258-284` (the three family empties) and
	// `:388-392` (the Public tab's own empty), plus the ordinary board.
	it.each<EmptyCase>([
		[
			'a family with nothing at all says "No family tasks yet"',
			facts({}),
			{ kind: 'no-family-tasks' }
		],
		[
			'a filter that matches nothing names the tag instead',
			facts({ tagFilter: 'garden' }),
			{ kind: 'no-match', tag: 'garden' }
		],
		[
			'the matched tag is trimmed and lowercased, as the heading shows it',
			facts({ tagFilter: '  GAR  ' }),
			{ kind: 'no-match', tag: 'gar' }
		],
		[
			'only completed rows left and no filter says "All caught up 🎉"',
			facts({ completed: 2 }),
			{ kind: 'all-caught-up' }
		],
		[
			'a filtered view with completed rows stays quiet rather than claiming "caught up"',
			facts({ completed: 2, tagFilter: 'garden' }),
			{ kind: 'board' }
		],
		['open rows render the board', facts({ open: 1 }), { kind: 'board' }],
		['both scopes with work render the board', facts({ open: 1, completed: 1 }), { kind: 'board' }],
		[
			'the Public tab with nothing public says "No public tasks yet"',
			facts({ tab: 'public' }),
			{ kind: 'no-public-tasks' }
		],
		[
			'the Public tab ignores the tag filter — the filter belongs to the Family tab',
			facts({ tab: 'public', tagFilter: 'garden' }),
			{ kind: 'no-public-tasks' }
		],
		[
			'the Public tab with a row renders the board',
			facts({ tab: 'public', publicCount: 1 }),
			{ kind: 'board' }
		]
	])('the empty state says which kind of empty it is — %s', (_title, input, expected) => {
		expect(boardEmptyState(input)).toEqual(expected);
	});
});

type PendingRow = PendingTask & { id: string };

const row = (id: string, overrides: Partial<PendingRow>): PendingRow => ({
	id,
	assignedTo: 'u_viewer',
	assignmentStatus: 'pending',
	completedAt: null,
	...overrides
});

describe('pendingForViewer', () => {
	// Legacy `family/tasks/+page.svelte:60-64`: `assignedTo === data.userId &&
	// assignmentStatus === 'pending'` over the open, tag-filtered list.
	it('counts only handoffs to this viewer that are still pending', () => {
		const tasks = [
			row('mine', {}),
			row('theirs', { assignedTo: 'u_other' }),
			row('accepted', { assignmentStatus: 'accepted' }),
			row('done', { completedAt: '2026-01-02 10:00:00+00' }),
			row('undeclined', { assignmentStatus: 'declined' })
		];
		expect(pendingForViewer(tasks, 'u_viewer').map((task) => task.id)).toEqual(['mine']);
	});

	it('keeps the rows, not a count, so the page can name them', () => {
		const tasks = [row('a', {}), row('b', {})];
		expect(pendingForViewer(tasks, 'u_viewer')).toEqual(tasks);
	});

	it('keeps the order it was handed', () => {
		const tasks = [row('b', {}), row('a', {}), row('c', { assignedTo: null })];
		expect(pendingForViewer(tasks, 'u_viewer').map((task) => task.id)).toEqual(['b', 'a']);
	});

	it('is empty for a viewer with no handoffs waiting', () => {
		expect(pendingForViewer([row('theirs', { assignedTo: 'u_other' })], 'u_viewer')).toEqual([]);
	});
});

describe('publicTabLabel', () => {
	// Legacy `family/tasks/+page.svelte:251`: `Public tasks ({publicTasks.length})`.
	it.each<[string, number, string]>([
		['names the count, zero included', 0, 'Public tasks (0)'],
		['counts the rows the tab will show', 3, 'Public tasks (3)']
	])('%s', (_title, count, expected) => {
		expect(publicTabLabel(count)).toBe(expected);
	});
});

type WindowRow = { id: string; completedAt: string | null };

/** A board list in the read's own order: newest created first, open and done mixed. */
const boardRows: readonly WindowRow[] = [
	{ id: 'open-a', completedAt: null },
	{ id: 'done-1', completedAt: '2026-01-05 10:00:00+00' },
	{ id: 'open-b', completedAt: null },
	{ id: 'done-2', completedAt: '2026-01-04 10:00:00+00' },
	{ id: 'done-3', completedAt: '2026-01-03 10:00:00+00' }
];

describe('windowCompletedTasks', () => {
	// Q-091 (owner, 2026-11-12): the board shows the newest 50 completed Tasks
	// and the heading keeps the true count; the `/api` twin stays unbounded.
	it('keeps the window in the read order and counts every completed row', () => {
		expect(windowCompletedTasks(boardRows, 2)).toEqual({
			tasks: [
				{ id: 'open-a', completedAt: null },
				{ id: 'done-1', completedAt: '2026-01-05 10:00:00+00' },
				{ id: 'open-b', completedAt: null },
				{ id: 'done-2', completedAt: '2026-01-04 10:00:00+00' }
			],
			completedTotal: 3
		});
	});

	it('never windows an open row, even past the limit', () => {
		const rows: readonly WindowRow[] = [
			{ id: 'open-1', completedAt: null },
			{ id: 'open-2', completedAt: null },
			{ id: 'done', completedAt: '2026-01-05 10:00:00+00' }
		];
		expect(windowCompletedTasks(rows, 0).tasks.map((row) => row.id)).toEqual(['open-1', 'open-2']);
	});

	it('keeps the whole list and still counts it when no limit is asked for', () => {
		expect(windowCompletedTasks(boardRows, null)).toEqual({
			tasks: boardRows,
			completedTotal: 3
		});
	});

	it('answers a family with nothing completed as an empty count', () => {
		const rows: readonly WindowRow[] = [{ id: 'open', completedAt: null }];
		expect(windowCompletedTasks(rows, 50)).toEqual({ tasks: rows, completedTotal: 0 });
	});
});

describe('groupBoardColumns', () => {
	// Issue 101 decision 1 + the approved board: viewer first then by name,
	// urgency inside a column, and only Tasks WITH an assignee (the Nobody card
	// is the caller's split).
	const NOW = new Date('2026-09-30T10:00:00.000Z');
	const names: Record<string, string> = { u_ann: 'You', u_bob: 'Bob Roy', u_zed: 'Zed Owen' };
	const nameFor = (id: string) => names[id] ?? id;

	const rows = [
		buildFamilyBoardTaskWire({
			id: 'late',
			assignedTo: 'u_ann',
			dueDate: '2026-09-28 09:00:00+00'
		}),
		buildFamilyBoardTaskWire({
			id: 'later',
			assignedTo: 'u_ann',
			dueDate: '2026-10-10 09:00:00+00'
		}),
		buildFamilyBoardTaskWire({ id: 'bobs', assignedTo: 'u_bob', userId: 'u_bob' }),
		buildFamilyBoardTaskWire({ id: 'zeds', assignedTo: 'u_zed', userId: 'u_zed' })
	];

	it('puts the viewer first, then the other members by name', () => {
		const columns = groupBoardColumns(rows, nameFor, 'u_ann', NOW);
		expect(columns.map((column) => column.ownerId)).toEqual(['u_ann', 'u_bob', 'u_zed']);
		expect(columns.map((column) => column.name)).toEqual(['You', 'Bob Roy', 'Zed Owen']);
	});

	it('orders a column by urgency, the overdue Task first', () => {
		const columns = groupBoardColumns(rows, nameFor, 'u_ann', NOW);
		expect(columns[0]?.tasks.map((task) => task.id)).toEqual(['late', 'later']);
	});

	it('renders no column for a member with nothing assigned', () => {
		const columns = groupBoardColumns(
			[buildFamilyBoardTaskWire({ assignedTo: 'u_bob' })],
			nameFor,
			'u_ann',
			NOW
		);
		expect(columns.map((column) => column.ownerId)).toEqual(['u_bob']);
	});
});
