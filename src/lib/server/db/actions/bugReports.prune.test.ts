import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bugReports } from '../schema';
import type { SQL } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';

/**
 * #029 M5 — resolved bug reports are pruned by the weekly cron after the
 * retention window. The stub swallows predicates, so the captured
 * where-condition is rendered to real Postgres SQL to prove the rule:
 * status no longer open, and resolved (or created) before the cutoff.
 * A prune without a WHERE clause would be silent data loss.
 */

type PgTable = typeof bugReports;

interface ScriptedState {
	returning: { id: string }[];
	deletedTable: unknown;
	whereCount: number;
	lastWhere: unknown;
}

const state = vi.hoisted(
	(): ScriptedState => ({ returning: [], deletedTable: null, whereCount: 0, lastWhere: null })
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- db is infra; the predicate is what is under test.
vi.mock('$lib/server/db', () => ({
	db: {
		delete: (table: PgTable) => {
			state.deletedTable = table;
			return {
				where: (condition: unknown) => {
					state.whereCount++;
					state.lastWhere = condition;
					return { returning: async () => state.returning };
				}
			};
		}
	}
}));

import { pruneResolvedBugReports } from './bugReports';

function renderDeleteWhere(): string {
	// drizzle 0.45's QueryBuilder has no .delete — the predicate's rendered
	// SQL is identical against a select on the same table, so assert there.
	return new QueryBuilder()
		.select()
		.from(bugReports)
		.where(state.lastWhere as SQL)
		.toSQL().sql;
}

beforeEach(() => {
	state.returning = [];
	state.deletedTable = null;
	state.whereCount = 0;
	state.lastWhere = null;
});

describe('pruneResolvedBugReports (#029 M5)', () => {
	it('reports how many rows it removed', async () => {
		state.returning = [{ id: 'b1' }];
		await expect(pruneResolvedBugReports(new Date('2026-07-01T00:00:00Z'))).resolves.toBe(1);
	});

	it('deletes only non-open reports resolved or created before the cutoff', async () => {
		state.returning = [{ id: 'b1' }, { id: 'b2' }];
		await pruneResolvedBugReports(new Date('2026-07-01T00:00:00.000Z'));

		expect(state.deletedTable).toBe(bugReports);
		expect(state.whereCount).toBe(1);
		const sql = renderDeleteWhere();
		expect(sql).toMatch(/"bugReports"\."status" <> \$1/);
		expect(sql).toMatch(
			/coalesce\("bugReports"\."resolvedAt", "bugReports"\."createdAt"\) < \$2/
		);
	});

	it('never deletes open reports, however old', async () => {
		await pruneResolvedBugReports(new Date('2026-07-01T00:00:00.000Z'));
		expect(renderDeleteWhere()).toMatch(/"bugReports"\."status" <> \$1/);
	});
});
