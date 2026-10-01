import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { TaskSortKey } from './taskSort';
import {
	bucketCounts,
	lateChip,
	lateDays,
	sortFlatTasks,
	urgencyBucket,
	type UrgencyBucket,
	type UrgencyTask
} from './taskUrgency';

/** A fixed local "now" (2026-09-30, 10:00) so every offset below is exact. */
const NOW = new Date(2026, 8, 30, 10, 0, 0);

/** ISO timestamp `days` from today at `hour` local time. */
function localIso(days: number, hour = 9): string {
	const d = new Date(NOW);
	d.setDate(d.getDate() + days);
	d.setHours(hour, 0, 0, 0);
	return d.toISOString();
}

const BASE: UrgencyTask = { title: 'Task', dueDate: null, completedAt: null };

function task(overrides: Partial<UrgencyTask> = {}): UrgencyTask {
	return { ...BASE, ...overrides };
}

const BUCKET_CASES: { when: string; due: string | null; want: UrgencyBucket }[] = [
	{ when: 'yesterday', due: localIso(-1), want: 'overdue' },
	{ when: 'last week', due: localIso(-7), want: 'overdue' },
	{ when: 'earlier this morning', due: localIso(0, 9), want: 'today' },
	{ when: 'later tonight', due: localIso(0, 20), want: 'today' },
	{ when: 'tomorrow', due: localIso(1), want: 'upnext' },
	{ when: 'next month', due: localIso(30), want: 'upnext' },
	{ when: 'no due date at all', due: null, want: 'upnext' }
];

const LATE_CASES: { when: string; due: string; days: number; chip: string }[] = [
	{ when: 'yesterday', due: localIso(-1), days: 1, chip: '1 day late' },
	{ when: 'three days ago', due: localIso(-3), days: 3, chip: '3 days late' },
	{ when: 'two weeks ago', due: localIso(-14), days: 14, chip: '14 days late' }
];

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('urgencyBucket', () => {
	for (const c of BUCKET_CASES) {
		it(`files a task due ${c.when} as ${c.want}`, () => {
			expect(urgencyBucket(task({ dueDate: c.due }))).toBe(c.want);
		});
	}

	it('files a finished task as done whatever its date says', () => {
		expect(urgencyBucket(task({ dueDate: localIso(-30), completedAt: localIso(0) }))).toBe('done');
		expect(urgencyBucket(task({ completedAt: localIso(0) }))).toBe('done');
	});
});

describe('the flat list order', () => {
	const rows = [
		task({ title: 'up next', dueDate: localIso(4) }),
		task({ title: 'today evening', dueDate: localIso(0, 20) }),
		task({ title: 'undated' }),
		task({ title: 'overdue, older', dueDate: localIso(-6) }),
		task({ title: 'done', dueDate: localIso(-2), completedAt: localIso(0) }),
		task({ title: 'today morning', dueDate: localIso(0, 9) }),
		task({ title: 'overdue, newer', dueDate: localIso(-1) }),
		task({ title: 'up next sooner', dueDate: localIso(1) })
	];

	it('is overdue, then today, then up next, then done — and by date inside each', () => {
		const sorted = [...rows].sort((a, b) => sortFlatTasks(a, b, 'urgency'));
		expect(sorted.map((t) => t.title)).toEqual([
			'overdue, older',
			'overdue, newer',
			'today morning',
			'today evening',
			'up next sooner',
			'up next',
			'undated',
			'done'
		]);
	});

	const SORT_KEYS: TaskSortKey[] = ['urgency', 'due', 'priority', 'created', 'title'];

	for (const key of SORT_KEYS) {
		it(`keeps finished work at the end under the ${key} sort`, () => {
			const sorted = [...rows].sort((a, b) => sortFlatTasks(a, b, key));
			expect(sorted.at(-1)?.title).toBe('done');
			// A finished task that sorts first by its own fields must still be last.
			const onlyDone = [
				task({ title: 'done', dueDate: localIso(-99), completedAt: localIso(0) }),
				task({ title: 'open', dueDate: localIso(5) })
			];
			expect(onlyDone.sort((a, b) => sortFlatTasks(a, b, key)).at(-1)?.title).toBe('done');
		});
	}
});

describe('lateDays / lateChip', () => {
	for (const c of LATE_CASES) {
		it(`calls a task due ${c.when} "${c.chip}"`, () => {
			expect(lateDays(c.due)).toBe(c.days);
			expect(lateChip(c.due)).toBe(c.chip);
		});
	}

	it('says nothing for a task due today', () => {
		expect(lateDays(localIso(0, 20))).toBe(0);
		expect(lateChip(localIso(0, 20))).toBeNull();
	});

	it('says nothing for a task due tomorrow', () => {
		expect(lateChip(localIso(1))).toBeNull();
	});

	it('says nothing for a task with no date', () => {
		expect(lateChip(null)).toBeNull();
	});
});

describe('bucketCounts', () => {
	it('counts what the jump bar prints', () => {
		expect(
			bucketCounts([
				task({ dueDate: localIso(-2) }),
				task({ dueDate: localIso(-1) }),
				task({ dueDate: localIso(0, 12) }),
				task({ dueDate: localIso(3) }),
				task({ dueDate: localIso(9) }),
				task({ completedAt: localIso(0) })
			])
		).toEqual({ overdue: 2, today: 1, upnext: 2, done: 1 });
	});

	it('is all zeroes on an empty list', () => {
		expect(bucketCounts([])).toEqual({ overdue: 0, today: 0, upnext: 0, done: 0 });
	});
});
