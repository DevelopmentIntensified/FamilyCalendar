import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { getTaskStats } from './taskStats';

/**
 * #146 — every completion figure in the SHARED statistics action must be a read
 * of the `taskCompletions` history table, never of `tasks.completedAt` /
 * `tasks.completionCount`, which the recurring-task cursor overwrites on every
 * check-off. A repeating task checked off N times must show N real completions
 * while the "completed at least once" figure stays pinned to distinct tasks.
 *
 * The drizzle query-builder is scripted (repo-wide action-test pattern): rows
 * are queued per select, and every select's `from` table is recorded so the
 * test can prove WHERE each figure is counted from — that is the whole defect.
 */

const state = vi.hoisted(() => ({
	/** Rows returned by each successive select() call. */
	queue: [] as Record<string, unknown>[][],
	/** Table name behind each select's .from(...), in call order. */
	plans: [] as string[]
}));

// The factory may only reference `mock`-prefixed bindings (vitest hoisting),
// so getTableName is aliased.
const mockGetTableName = getTableName;

vi.mock('$lib/server/db', async () => {
	const thenable = (rows: Record<string, unknown>[]) => {
		const b: Record<string, unknown> = {};
		for (const method of ['innerJoin', 'leftJoin', 'where', 'groupBy', 'orderBy', 'limit']) {
			b[method] = () => b;
		}
		b.then = (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
			Promise.resolve(rows).then(resolve, reject);
		b.catch = (reject: (e: unknown) => unknown) => Promise.resolve(rows).catch(reject);
		return b;
	};
	return {
		db: {
			select: () => ({
				from: (table: Parameters<typeof mockGetTableName>[0]) => {
					state.plans.push(mockGetTableName(table));
					return thenable(state.queue.shift() ?? []);
				}
			})
		}
	};
});

/** Script one getTaskStats run over `checkOffs` check-offs of a single
 *  weekly task (plus a one-off task, so distinct-counting is exercised). */
async function runStats(checkOffs: number) {
	state.queue = [
		// completedOnce — distinct taskIds in the history table.
		[{ total: 2 }],
		// recurringTasks — recurring task rows (not a completion figure).
		[{ total: 1 }],
		// recurringCompletions — history rows joined to a recurring task.
		[{ total: checkOffs }],
		// topAssigners
		[],
		// topAssignees
		[],
		// recentlyCompleted — latest history instants joined to their tasks.
		[
			{
				title: 'Water the plants',
				completedAt: `2026-10-${15 + (checkOffs % 2)} 09:00:00+00`,
				recurrenceFrequency: 'weekly',
				completionCount: checkOffs
			},
			{ title: 'Book the dentist', completedAt: '2026-10-14 08:00:00+00', recurrenceFrequency: null }
		],
		// This month — history rows, recurring split.
		[{ total: checkOffs + 1, recurring: checkOffs }],
		// Done by — acting users joined from history.
		[{ name: 'Mom', count: checkOffs }]
	];
	state.plans = [];
	return getTaskStats('user-1');
}

describe('getTaskStats — completion figures read the history table (#146)', () => {
	beforeEach(() => {
		state.queue = [];
		state.plans = [];
	});

	it('repeated check-offs of one repeating task keep the figures steady', async () => {
		const after5 = await runStats(5);
		const after6 = await runStats(6);

		// A 6th check-off of the SAME task adds one completion, not one
		// "completed task": the cursor overwriting `completedAt` must not move it.
		expect(after5.completedOnce).toBe(2);
		expect(after6.completedOnce).toBe(2);
		expect(after5.recurringTasks).toBe(1);
		expect(after6.recurringTasks).toBe(1);
		// Real check-offs count up truthfully — no clamping, no smoothing.
		expect(after5.recurringCompletions).toBe(5);
		expect(after6.recurringCompletions).toBe(6);
		expect(after5.month).toEqual({ completed: 6, recurring: 5 });
		expect(after6.month).toEqual({ completed: 7, recurring: 6 });
		expect(after5.doneBy).toEqual([{ name: 'Mom', count: 5 }]);
	});

	it('counts completions from taskCompletions, never the overwritten columns', async () => {
		const stats = await runStats(5);

		// Every completion figure's query originates at the history table.
		// plans: [completedOnce, recurringTasks, recurringCompletions, assigners,
		//         assignees, recentlyCompleted, month, doneBy]
		expect(state.plans[0]).toBe('taskCompletions');
		expect(state.plans[2]).toBe('taskCompletions');
		expect(state.plans[5]).toBe('taskCompletions');
		expect(state.plans[6]).toBe('taskCompletions');
		expect(state.plans[7]).toBe('taskCompletions');

		// The recent list shows the recurring task's LAST check-off (history
		// timestamp), not a stale one-off `completedAt` the cursor never sets —
		// the old query filtered `completedAt IS NOT NULL` and recurring tasks
		// vanished from "Recently completed" entirely.
		expect(stats.recentlyCompleted[0]).toEqual({
			title: 'Water the plants',
			completedAt: '2026-10-16T09:00:00.000Z',
			recurring: true
		});
		expect(stats.recentlyCompleted[1]).toEqual({
			title: 'Book the dentist',
			completedAt: '2026-10-14T08:00:00.000Z',
			recurring: false
		});
	});
});
