import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adEvents } from '../schema';
import type { SQL } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';

/**
 * #088 — adEvents is written by the ad-injection path and read by nothing.
 * The weekly cron prunes created rows past the retention window (prune) and
 * the reporting read groups the last window by target plan. The stub swallows
 * predicates, so each captured where-condition is rendered to real Postgres
 * SQL to prove the rule. A prune without a WHERE clause would be silent data
 * loss.
 */

type PgTable = typeof adEvents;

interface ScriptedState {
	returning: { id: string }[];
	deletedTable: PgTable | null;
	lastDeleteWhere: SQL | null;
	lastSelectTable: PgTable | null;
	lastSelectWhere: SQL | null;
	groupResult: { kind: string | null; count: number }[];
}

const state = vi.hoisted(
	(): ScriptedState => ({
		returning: [],
		deletedTable: null,
		lastDeleteWhere: null,
		lastSelectTable: null,
		lastSelectWhere: null,
		groupResult: []
	})
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- db is infra; the predicates are what are under test.
vi.mock('$lib/server/db', () => ({
	db: {
		delete: (table: PgTable) => {
			state.deletedTable = table;
			return {
				where: (condition: SQL) => {
					state.lastDeleteWhere = condition;
					return { returning: async () => state.returning };
				}
			};
		},
		select: () => ({
			from: (table: PgTable) => {
				state.lastSelectTable = table;
				return {
					where: (condition: SQL) => {
						state.lastSelectWhere = condition;
						return {
							groupBy: async () => state.groupResult
						};
					}
				};
			}
		})
	}
}));

import { pruneAdEventsOlderThan, countRecentAdEventsByTargetPlan } from './adEvents';

function renderFreshWhere(condition: SQL | null): string {
	// drizzle 0.45's QueryBuilder has no .delete — a predicate's rendered SQL is
	// identical against a select on the same table, so assert there.
	// SAFETY: the stub stores whatever where-condition drizzle handed it; the
	// render only accepts the SQL fragments asserted above, and a non-SQL shape
	// would fail the very regex the assertions pin.
	return new QueryBuilder()
		.select()
		.from(adEvents)
		.where(condition as SQL)
		.toSQL().sql;
}

beforeEach(() => {
	state.returning = [];
	state.deletedTable = null;
	state.lastDeleteWhere = null;
	state.lastSelectTable = null;
	state.lastSelectWhere = null;
	state.groupResult = [];
});

describe('pruneAdEventsOlderThan (#088)', () => {
	it('reports how many rows it removed', async () => {
		state.returning = [{ id: 'a1' }];
		await expect(pruneAdEventsOlderThan(new Date('2026-07-01T00:00:00Z'))).resolves.toBe(1);
	});

	it('deletes only ad rows created before the cutoff', async () => {
		state.returning = [{ id: 'a1' }, { id: 'a2' }];
		await pruneAdEventsOlderThan(new Date('2026-07-01T00:00:00.000Z'));

		expect(state.deletedTable).toBe(adEvents);
		expect(renderFreshWhere(state.lastDeleteWhere)).toMatch(/"adEvents"\."createdAt" < \$1/);
	});

	it('keeps the rule even when nothing matched', async () => {
		await pruneAdEventsOlderThan(new Date('2026-07-01T00:00:00.000Z'));
		expect(renderFreshWhere(state.lastDeleteWhere)).toMatch(/"adEvents"\."createdAt" < \$1/);
	});
});

describe('countRecentAdEventsByTargetPlan (#088)', () => {
	it('groups ad rows created inside the window by target plan', async () => {
		state.groupResult = [
			{ kind: 'premium', count: 3 },
			{ kind: 'annual', count: 1 }
		];
		const rows = await countRecentAdEventsByTargetPlan(new Date('2026-07-01T00:00:00Z'));

		expect(state.lastSelectTable).toBe(adEvents);
		expect(renderFreshWhere(state.lastSelectWhere)).toMatch(/"adEvents"\."createdAt" >= \$1/);
		expect(rows).toEqual([
			{ kind: 'premium', count: 3 },
			{ kind: 'annual', count: 1 }
		]);
	});
});
