import { describe, it, expect, vi, beforeEach } from 'vitest';
import { unmatchedPhrases } from '../schema';
import type { SQL } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';

/**
 * #029 M5 — resolved unmatched phrases are pruned by the weekly cron after
 * the retention window. The stub swallows predicates, so the captured
 * where-condition is rendered to real Postgres SQL to prove the rule:
 * resolved = true AND updated before the cutoff. Unresolved phrases are
 * parser-improvement signal — an unscoped delete would destroy them.
 */

type PgTable = typeof unmatchedPhrases;

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

import { pruneResolvedUnmatchedPhrases } from './unmatchedPhrases';

function renderDeleteWhere(): string {
	// drizzle 0.45's QueryBuilder has no .delete — the predicate's rendered
	// SQL is identical against a select on the same table, so assert there.
	return new QueryBuilder()
		.select()
		.from(unmatchedPhrases)
		.where(state.lastWhere as SQL)
		.toSQL().sql;
}

beforeEach(() => {
	state.returning = [];
	state.deletedTable = null;
	state.whereCount = 0;
	state.lastWhere = null;
});

describe('pruneResolvedUnmatchedPhrases (#029 M5)', () => {
	it('reports how many rows it removed', async () => {
		state.returning = [{ id: 'p1' }];
		await expect(pruneResolvedUnmatchedPhrases(new Date('2026-07-01T00:00:00Z'))).resolves.toBe(
			1
		);
	});

	it('deletes only resolved phrases updated before the cutoff', async () => {
		state.returning = [{ id: 'p1' }, { id: 'p2' }];
		await pruneResolvedUnmatchedPhrases(new Date('2026-07-01T00:00:00.000Z'));

		expect(state.deletedTable).toBe(unmatchedPhrases);
		expect(state.whereCount).toBe(1);
		const sql = renderDeleteWhere();
		expect(sql).toMatch(/"unmatchedPhrases"\."resolved" = \$1/);
		expect(sql).toMatch(/"unmatchedPhrases"\."updatedAt" < \$2/);
	});

	it('never deletes unresolved phrases', async () => {
		await pruneResolvedUnmatchedPhrases(new Date('2026-07-01T00:00:00.000Z'));
		// Unresolved rows are the parser's to-do list; the resolved leg of the
		// predicate is what protects them.
		expect(renderDeleteWhere()).toMatch(/"unmatchedPhrases"\."resolved" = \$1/);
	});
});
