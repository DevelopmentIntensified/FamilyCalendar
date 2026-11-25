import { describe, it, expect } from 'vitest';
import { buildTaskRow } from './tasks.ui.fixtures';
import {
	countTasksCompletedThisWeek,
	isTaskDueToday,
	isTaskOverdue,
	matchesTaskChip,
	matchesTaskSearch,
	matchesTaskTagFilter,
	mergeDayCompletions,
	sortTaskRows,
	splitTasksByRecurrence,
	taskBucketCounts,
	taskInOwnerView,
	taskLateChip,
	taskLateDays,
	taskMemberName,
	taskRowFromWire,
	taskUrgencyBucket
} from './tasks.list.rules';

/** A fixed "now": local noon on 15 September 2026. */
const NOW = new Date(2026, 8, 15, 12, 0, 0, 0);
const at = (month: number, day: number, hour = 9) =>
	new Date(2026, month, day, hour, 0, 0, 0).toISOString();

describe('task urgency buckets', () => {
	const cases = [
		{ name: 'finished, whatever its date', due: at(8, 1), completed: at(8, 2), want: 'done' },
		{ name: 'before today', due: at(8, 14, 23), completed: null, want: 'overdue' },
		{ name: 'today', due: at(8, 15), completed: null, want: 'today' },
		{ name: 'later today', due: at(8, 15, 23), completed: null, want: 'today' },
		{ name: 'tomorrow', due: at(8, 16), completed: null, want: 'upnext' },
		{ name: 'no date', due: null, completed: null, want: 'upnext' }
	] as const;

	it.each(cases)('$name is $want', ({ due, completed, want }) => {
		const task = buildTaskRow({ dueDate: due, completedAt: completed });
		expect(taskUrgencyBucket(task, NOW)).toBe(want);
	});

	it('reads a due date through the local day boundary', () => {
		expect(isTaskOverdue(at(8, 14, 23), NOW)).toBe(true);
		expect(isTaskOverdue(at(8, 15, 0), NOW)).toBe(false);
		expect(isTaskDueToday(at(8, 15, 23), NOW)).toBe(true);
		expect(isTaskDueToday(at(8, 16, 0), NOW)).toBe(false);
	});
});

describe('late chip', () => {
	it.each([
		{ due: at(8, 15), latest: 0, chip: null },
		{ due: at(8, 14), latest: 1, chip: '1 day late' },
		{ due: at(8, 10), latest: 5, chip: '5 days late' },
		{ due: null, latest: 0, chip: null }
	])('$due prints $chip', ({ due, latest, chip }) => {
		expect(taskLateDays(due, NOW)).toBe(latest);
		expect(taskLateChip(due, NOW)).toBe(chip);
	});
});

describe('sortTaskRows', () => {
	const overdue = buildTaskRow({ id: 'a', title: 'Overdue', dueDate: at(8, 10) });
	const today = buildTaskRow({ id: 'b', title: 'Today', dueDate: at(8, 15) });
	const next = buildTaskRow({ id: 'c', title: 'Next', dueDate: at(8, 20) });
	const done = buildTaskRow({ id: 'd', title: 'Done', dueDate: at(8, 1), completedAt: at(8, 2) });

	it('puts finished work after every open row, whatever the key', () => {
		const rows = [done, next, overdue, today].sort((a, b) => sortTaskRows(a, b, 'title', NOW));
		expect(rows.at(-1)?.id).toBe('d');
		for (const key of ['urgency', 'due', 'priority', 'created', 'title'] as const) {
			expect([done, today].sort((a, b) => sortTaskRows(a, b, key, NOW))[1]?.id).toBe('d');
		}
	});

	it('orders by urgency: overdue → today → up next', () => {
		expect([next, today, overdue].sort((a, b) => sortTaskRows(a, b, 'urgency', NOW))).toEqual([
			overdue,
			today,
			next
		]);
	});

	it('orders priority high → normal → low, then the title', () => {
		const high = buildTaskRow({ id: 'h', title: 'Bravo', priority: 'high' });
		const low = buildTaskRow({ id: 'l', title: 'Alpha', priority: 'low' });
		const normalA = buildTaskRow({ id: 'n1', title: 'Alpha', priority: 'normal' });
		const normalB = buildTaskRow({ id: 'n2', title: 'Bravo', priority: 'unknown' });
		expect([low, normalB, high, normalA].sort((a, b) => sortTaskRows(a, b, 'priority', NOW))).toEqual(
			[high, normalA, normalB, low]
		);
	});

	it('orders created newest first and title A–Z case-insensitively', () => {
		const older = buildTaskRow({ id: 'o', createdAt: at(7, 1) });
		const newer = buildTaskRow({ id: 'n', createdAt: at(8, 1) });
		expect([older, newer].sort((a, b) => sortTaskRows(a, b, 'created', NOW))[0]?.id).toBe('n');
		const zebra = buildTaskRow({ id: 'z', title: 'zebra' });
		const apple = buildTaskRow({ id: 'ap', title: 'Apple' });
		expect([zebra, apple].sort((a, b) => sortTaskRows(a, b, 'title', NOW))).toEqual([apple, zebra]);
	});
});

describe('taskBucketCounts', () => {
	it('counts one bucket per row', () => {
		const rows = [
			buildTaskRow({ dueDate: at(8, 10) }),
			buildTaskRow({ dueDate: at(8, 15) }),
			buildTaskRow({ dueDate: at(8, 20) }),
			buildTaskRow({ dueDate: null }),
			buildTaskRow({ completedAt: at(8, 14) })
		];
		expect(taskBucketCounts(rows, NOW)).toEqual({ overdue: 1, today: 1, upnext: 2, done: 1 });
	});
});

describe('countTasksCompletedThisWeek', () => {
	it('counts only the last seven days', () => {
		const rows = [
			buildTaskRow({ completedAt: at(8, 14) }),
			buildTaskRow({ completedAt: at(8, 9) }),
			buildTaskRow({ completedAt: at(8, 7) }),
			buildTaskRow({ completedAt: null })
		];
		expect(countTasksCompletedThisWeek(rows, NOW)).toBe(2);
	});
});

describe('splitTasksByRecurrence', () => {
	it('puts each row in exactly one bucket', () => {
		const recurring = buildTaskRow({ id: 'r', recurrenceFrequency: 'weekly' });
		const oneOff = buildTaskRow({ id: 'o' });
		expect(splitTasksByRecurrence([recurring, oneOff])).toEqual({
			recurring: [recurring],
			oneOff: [oneOff]
		});
	});
});

describe('filters', () => {
	it.each([
		{ chip: 'all', row: { familyId: undefined }, want: true },
		{ chip: 'family', row: { familyId: 'f1' }, want: true },
		{ chip: 'family', row: { familyId: null }, want: false },
		{ chip: 'private', row: { visibility: 'private' }, want: true },
		{ chip: 'private', row: { visibility: 'public' }, want: false },
		{ chip: 'public', row: { visibility: 'public' }, want: true },
		{ chip: 'public', row: { visibility: 'private' }, want: false }
	] as const)('$chip chip on $row', ({ chip, row, want }) => {
		expect(matchesTaskChip(buildTaskRow(row), chip)).toBe(want);
	});

	it('search matches title, notes, tags, the stored name and the roster name', () => {
		const name = () => 'Sam Rivera';
		const row = buildTaskRow({
			title: 'Wash the car',
			notes: 'before sunday',
			tags: ['outside'],
			assigneeFirstName: 'Sam',
			assigneeLastName: 'Rivera',
			assignedTo: 'u2'
		});
		for (const query of ['wash', 'SUNDAY', 'out', 'sam', 'rivera', '']) {
			expect(matchesTaskSearch(row, query, name)).toBe(true);
		}
		expect(matchesTaskSearch(row, 'mow', name)).toBe(false);
	});

	it('tag filter is a prefix match, case-insensitively', () => {
		expect(matchesTaskTagFilter(['groceries'], 'gro')).toBe(true);
		expect(matchesTaskTagFilter(['groceries'], 'ROS')).toBe(false);
		expect(matchesTaskTagFilter([], '')).toBe(true);
	});

	it('owner axis: Mine is handed-to-me, Created by me is my rows', () => {
		const handedToMe = buildTaskRow({ userId: 'u2', assignedTo: 'u1' });
		const mine = buildTaskRow({ userId: 'u1', assignedTo: null });
		expect(taskInOwnerView(handedToMe, 'mine', 'u1')).toBe(true);
		expect(taskInOwnerView(mine, 'mine', 'u1')).toBe(false);
		expect(taskInOwnerView(mine, 'created', 'u1')).toBe(true);
		expect(taskInOwnerView(handedToMe, 'created', 'u1')).toBe(false);
		expect(taskInOwnerView(handedToMe, 'open', 'u1')).toBe(true);
	});
});

describe('taskMemberName', () => {
	it('names the roster, the viewer, or the id stub', () => {
		expect(taskMemberName({ firstName: 'Sam', lastName: 'Rivera' }, 'u2', 'u1')).toBe('Sam Rivera');
		expect(taskMemberName(undefined, 'u1', 'u1')).toBe('You');
		expect(taskMemberName(undefined, 'zzzzzzzz-x', 'u1')).toBe('zzzzzzzz');
	});
});

describe('taskRowFromWire', () => {
	it('starts names and Event fields empty and keeps the tags', () => {
		const row = taskRowFromWire({
			id: 't1',
			title: 'Wash',
			notes: null,
			dueDate: '2026-02-01 10:00:00+00',
			completedAt: null,
			archivedAt: null,
			recurrenceFrequency: null,
			recurrenceInterval: null,
			completionCount: 0,
			assignedTo: null,
			assignmentStatus: 'none',
			priority: 'normal',
			visibility: 'public',
			userId: 'u1',
			familyId: null,
			eventId: null,
			focusMinutes: null,
			focusStartedAt: null,
			category: null,
			createdAt: '2026-02-01T10:00:00.000Z',
			tags: ['home']
		});
		expect(row.tags).toEqual(['home']);
		expect(row.eventTitle).toBeNull();
		expect(row.assigneeFirstName).toBeNull();
	});
});

describe('mergeDayCompletions', () => {
	const rows = [
		{ id: 'one-off-late', completedAt: '2026-11-02T12:00:00.000Z' },
		{ id: 'recurring-early', completedAt: '2026-11-02T07:00:00.000Z' },
		{ id: 'one-off-mid', completedAt: '2026-11-02T09:30:00.000Z' }
	];

	it('merges the two halves newest first without mutating either input', () => {
		const oneOff = rows.slice(0, 1);
		const recurring = rows.slice(1);
		expect(mergeDayCompletions(oneOff, recurring).map((row) => row.id)).toEqual([
			'one-off-late',
			'one-off-mid',
			'recurring-early'
		]);
		expect(oneOff.map((row) => row.id)).toEqual(['one-off-late']);
		expect(recurring.map((row) => row.id)).toEqual(['recurring-early', 'one-off-mid']);
	});

	it('sorts a null instant last (legacy read it as epoch 0)', () => {
		expect(
			mergeDayCompletions([{ id: 'none', completedAt: null }], [
				{ id: 'at', completedAt: '2026-11-02T07:00:00.000Z' }
			]).map((row) => row.id)
		).toEqual(['at', 'none']);
	});
});
