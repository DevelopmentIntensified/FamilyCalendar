import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * undoRecurringCompletion reverses a Recurring Task check-off: it restores
 * the previous due date, decrements the completion tally, and removes the
 * matching taskCompletions history row (so streaks/stats don't count an
 * undone completion). Rules mirror toggleTaskComplete's eligibility.
 */
const state = vi.hoisted(() => ({
	queue: [] as unknown[][],
	updatePatch: null as Record<string, unknown> | null,
	updateResult: null as Record<string, unknown> | null,
	deleteWhere: null as unknown,
	deleteResult: {} as { rowCount: number }
}));

vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => {
					const rows = state.queue.shift() ?? [];
					return {
						// thenable so existing `await select...where` resolves to rows
						then: (resolve: (v: unknown) => unknown) => resolve(rows),
						orderBy: () => ({ limit: () => Promise.resolve(rows) })
					};
				}
			})
		}),
		update: () => ({
			set: (patch: Record<string, unknown>) => {
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

function recurringTask(overrides: Record<string, unknown> = {}) {
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
		expect(await undoRecurringCompletion('missing', 'user-a', '2026-08-28T23:59:00.000Z')).toBeNull();
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
