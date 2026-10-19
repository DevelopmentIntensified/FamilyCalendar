import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { taskCompletions } from '$lib/server/db/schema';
import { getTaskStats } from './taskStats';

/**
 * #092 — the stats page must credit a completion to the person who DID it
 * (the `actorId` column), falling back to the task owner for legacy rows
 * written before the column existed. The dashboard's streak already reads
 * the same two-leg predicate; the stats figures filtered by owner only, so
 * a partner checking off a task assigned to you was credited to YOU.
 *
 * The repo action-test mock ignores `where` payloads, so this suite captures
 * every select's where-clause and renders it to real SQL with drizzle's
 * QueryBuilder — proving the predicate, including the legacy fallback leg.
 */

const state = vi.hoisted(() => ({
	/** Rows returned by each successive select() call. */
	queue: [] as Record<string, unknown>[][],
	/** Table name behind each select's .from(...), in call order. */
	plans: [] as string[],
	/** The where-condition passed to each select, in call order. */
	wheres: [] as unknown[]
}));

// The factory may only reference `mock`-prefixed bindings (vitest hoisting).
const mockGetTableName = getTableName;

vi.mock('$lib/server/db', () => {
	const thenable = (rows: Record<string, unknown>[]) => {
		const b: Record<string, unknown> = {};
		for (const method of ['innerJoin', 'leftJoin', 'where', 'groupBy', 'orderBy', 'limit']) {
			b[method] = (...args: unknown[]) => {
				if (method === 'where') state.wheres.push(args[0]);
				return b;
			};
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

/** getTaskStats fires 8 selects, in this order. */
const PLAN = [
	'completedOnce',
	'recurringTasks',
	'recurringCompletions',
	'assigners',
	'assignees',
	'recentlyCompleted',
	'month',
	'doneBy'
] as const;

function renderWhere(index: number): string {
	const condition = state.wheres[index];
	return new QueryBuilder()
		.select()
		.from(taskCompletions)
		.where(condition as SQL)
		.toSQL().sql;
}

async function runStats() {
	state.queue = PLAN.map(() => []);
	state.plans = [];
	state.wheres = [];
	return getTaskStats('user-1');
}

/** The two-leg attribution predicate, as drizzle renders it for Postgres:
 *  the actor when present, the owner when the row predates the column. */
function expectAttribution(sql: string) {
	expect(sql).toContain('"taskCompletions"."actorId" is not null');
	expect(sql).toMatch(/"taskCompletions"\."actorId" = \$\d+/);
	// The legacy fallback leg — its own assertions so the day someone removes
	// it, a test fails rather than the numbers quietly drifting (#092).
	expect(sql).toContain('"taskCompletions"."actorId" is null');
	expect(sql).toMatch(/"taskCompletions"\."userId" = \$\d+/);
}

describe('getTaskStats — completions attribute to the actor, not the owner (#092)', () => {
	beforeEach(() => {
		state.queue = [];
		state.plans = [];
		state.wheres = [];
	});

	it('counts every viewer-facing figure by actor with legacy-owner fallback', async () => {
		await runStats();

		// The four figures that answer "how much did I complete":
		// completedOnce, recurringCompletions, recentlyCompleted, month.
		for (const index of [0, 2, 5, 6]) {
			expect(state.plans[index], PLAN[index]).toBe('taskCompletions');
			expectAttribution(renderWhere(index));
		}
	});

	it('keeps the legacy fallback leg on every attributed figure', async () => {
		await runStats();

		// Separate proof per the ticket: the owner fallback must survive
		// on its own test, not ride along in the aggregate assertion.
		for (const index of [0, 2, 5, 6]) {
			const sql = renderWhere(index);
			expect(sql, PLAN[index]).toContain('"taskCompletions"."actorId" is null');
			expect(sql, PLAN[index]).toMatch(/"taskCompletions"\."userId" = \$\d+/);
		}
	});

	it('keeps doneBy scoped to the viewer\u2019s own tasks, naming the actor', async () => {
		// Deliberate scope (not an oversight): "done by" is the per-person
		// breakdown of who did the work on THIS viewer's tasks — it names
		// other family members, so viewer-attribution would collapse it to
		// a single row and break the assigned-vs-done card.
		await runStats();

		const sql = renderWhere(7);
		expect(sql).toMatch(/"taskCompletions"\."userId" = \$\d+/);
		expect(sql).not.toContain('is not null');
	});
});
