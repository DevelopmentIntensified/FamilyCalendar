import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * toggleTaskComplete decision logic at the boundary: the drizzle
 * query-builder is replaced with a scripted stub (same pattern as
 * advanceTaskToNext.test.ts) so cursor advance / completion toggle /
 * history recording are verified without a live database.
 */
/** A stubbed DB row / patch: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null | Date>;

interface StubState {
	queue: Row[][];
	updatePatch: Row | null;
	updateResult: Row | null;
	insertValues: Row | null;
}

const state = vi.hoisted(
	(): StubState => ({
		queue: [],
		updatePatch: null,
		updateResult: null,
		insertValues: null
	})
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(state.queue.shift() ?? [])
			})
		}),
		update: () => ({
			set: (patch: Row) => {
				state.updatePatch = patch;
				return {
					where: () => ({
						returning: () => Promise.resolve(state.updateResult ? [state.updateResult] : [])
					})
				};
			}
		}),
		insert: () => ({
			values: (values: Row) => {
				state.insertValues = values;
				return Promise.resolve();
			}
		})
	}
}));

import { toggleTaskComplete, advanceCursor } from './tasks';

const nowIso = () => new Date().toISOString();

/** Base row for a daily recurring Task under test. */
type TaskRow = {
	id: string;
	title: string;
	notes: string | null;
	dueDate: string | null;
	completedAt: string | null;
	archivedAt: string | null;
	recurrenceFrequency: string | null;
	recurrenceInterval: number | null;
	completionCount: number;
	assignedTo: string | null;
	assignmentStatus: string;
	priority: string;
	userId: string;
	familyId: string | null;
	eventId: string | null;
	createdAt: Date;
};

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
	return {
		id: 't1',
		title: 'Water the plants',
		notes: null,
		dueDate: '2026-08-28T23:59:00.000Z',
		completedAt: null,
		archivedAt: null,
		recurrenceFrequency: 'daily',
		recurrenceInterval: 1,
		completionCount: 0,
		assignedTo: null,
		assignmentStatus: 'none',
		priority: 'normal',
		userId: 'user-a',
		familyId: null,
		eventId: null,
		createdAt: new Date(),
		...overrides
	};
}

beforeEach(() => {
	state.queue = [];
	state.updatePatch = null;
	state.updateResult = null;
	state.insertValues = null;
});

describe('toggleTaskComplete', () => {
	it('returns undefined when the task is missing or not the caller’s', async () => {
		state.queue = [[]];
		expect(await toggleTaskComplete('missing', 'user-a')).toBeUndefined();
	});

	it('checking an OPEN recurring task advances the cursor and records history', async () => {
		// Regression: advanceRecurringTask once returned undefined for open
		// recurring tasks (!task.completedAt), surfacing a bogus 404
		// "Task not found" for every recurring check-off.
		const task = makeTask();
		state.queue = [[task]];
		const expectedDue = advanceCursor(task.dueDate, 'daily', 1, nowIso());
		state.updateResult = { ...task, dueDate: expectedDue, completionCount: 1 };

		const result = await toggleTaskComplete('t1', 'user-a');

		expect(result).toBeDefined();
		expect(result!.dueDate).toBe(expectedDue);
		expect(state.updatePatch!.dueDate).toBe(expectedDue);
		expect(state.updatePatch).toHaveProperty('completionCount');
		expect(state.insertValues).toEqual({ taskId: 't1', userId: 'user-a', familyId: null });
	});

	it('checking a non-recurring open task sets completedAt and records history', async () => {
		const task = makeTask({ recurrenceFrequency: null, recurrenceInterval: null });
		state.queue = [[task]];
		state.updateResult = { ...task, completedAt: nowIso() };

		const result = await toggleTaskComplete('t1', 'user-a');

		expect(result).toBeDefined();
		expect(state.updatePatch!.completedAt).toEqual(expect.any(String));
		expect(state.insertValues).toMatchObject({ taskId: 't1', userId: 'user-a' });
	});

	it('un-checking a completed task clears completedAt without new history', async () => {
		const task = makeTask({
			recurrenceFrequency: null,
			recurrenceInterval: null,
			completedAt: '2026-08-29T10:00:00.000Z'
		});
		state.queue = [[task]];
		state.updateResult = { ...task, completedAt: null };

		await toggleTaskComplete('t1', 'user-a');

		expect(state.updatePatch).toEqual({ completedAt: null });
		expect(state.insertValues).toBeNull();
	});
});
