import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * undoRecurringCompletion reverses a Recurring Task check-off: it restores
 * the previous due date, decrements the completion tally, and removes the
 * matching taskCompletions history row (so streaks/stats don't count an
 * undone completion). Rules mirror toggleTaskComplete's eligibility.
 */
/** A stubbed DB row / patch: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null | Date>;

interface StubState {
	queue: Row[][];
	updatePatch: Row | null;
	updateResult: Row | null;
	deleteWhere: boolean | null;
	deleteResult: { rowCount: number };
}

const state = vi.hoisted(
	(): StubState => ({
		queue: [],
		updatePatch: null,
		updateResult: null,
		deleteWhere: null,
		deleteResult: { rowCount: 1 }
	})
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => {
					const rows = state.queue.shift() ?? [];
					// Promise + chained orderBy so await and .orderBy().limit() both resolve.
					return Object.assign(Promise.resolve(rows), {
						orderBy: () => ({ limit: () => Promise.resolve(rows) })
					});
				}
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
		delete: () => ({
			where: () => {
				state.deleteWhere = true;
				return state.deleteResult;
			}
		})
	}
}));

import { undoRecurringCompletion } from './tasks';

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

function recurringTask(overrides: Partial<TaskRow> = {}): TaskRow {
	return {
		id: 't1',
		title: 'Water the plants',
		notes: null,
		dueDate: '2026-09-01T23:59:00.000Z',
		completedAt: null,
		archivedAt: null,
		recurrenceFrequency: 'daily',
		recurrenceInterval: 1,
		completionCount: 5,
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
	state.deleteWhere = null;
	state.deleteResult = { rowCount: 1 };
});

describe('undoRecurringCompletion', () => {
	it('returns null when the task is missing or not the caller’s', async () => {
		state.queue = [[]];
		expect(
			await undoRecurringCompletion('missing', 'user-a', '2026-08-28T23:59:00.000Z')
		).toBeNull();
		expect(state.updatePatch).toBeNull();
	});

	it('returns null for non-recurring tasks — only recurring check-offs are undoable', async () => {
		state.queue = [[recurringTask({ recurrenceFrequency: null, recurrenceInterval: null })]];
		expect(await undoRecurringCompletion('t1', 'user-a', '2026-08-28T23:59:00.000Z')).toBeNull();
		expect(state.updatePatch).toBeNull();
	});

	it('restores the previous due date and decrements the completion tally', async () => {
		const task = recurringTask();
		state.queue = [[task]];
		const prevDue = '2026-08-28T23:59:00.000Z';
		state.updateResult = { ...task, dueDate: prevDue, completionCount: 4 };

		const result = await undoRecurringCompletion('t1', 'user-a', prevDue);

		expect(result).not.toBeNull();
		expect(result!.dueDate).toBe(prevDue);
		expect(result!.completionCount).toBe(4);
		expect(state.updatePatch).toMatchObject({ dueDate: prevDue });
		expect(state.updatePatch).toHaveProperty('completionCount');
	});

	it('removes the most recent completion history row so streaks are not double-counted', async () => {
		const task = recurringTask();
		// select #1 = the task, select #2 = the latest completion row
		state.queue = [[task], [{ id: 'comp-1' }]];
		state.updateResult = { ...task, dueDate: '2026-08-28T23:59:00.000Z', completionCount: 4 };

		await undoRecurringCompletion('t1', 'user-a', '2026-08-28T23:59:00.000Z');

		expect(state.deleteWhere).toBe(true);
	});
});
