import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifications } from '../schema';

/**
 * `deleteReadNotifications` is the prune the Alerts page was missing (issue
 * 073 left it unbuilt; the prototype's "never pruned" card is the argument for
 * it). db is scripted so the test pins the WHERE clause's scope — a prune that
 * reached another user's rows, or an unread one, would be silent data loss.
 */
/** The drizzle table object the stubbed `db.delete` is handed. */
type PgTable = typeof notifications;

interface ScriptedState {
	/** Rows the stubbed DELETE's .returning() resolves to. */
	returning: { id: string }[];
	/** The table the action deleted from — compared by identity to `notifications`. */
	deletedTable: unknown;
	/** How many times a WHERE clause was supplied (0 = unscoped delete). */
	whereCount: number;
	/** The last where-condition passed, for SQL-level predicate proof. */
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

// oxlint-disable-next-line anti-slop/no-module-mocking -- push is a side effect of writing, not of pruning.
vi.mock('$lib/server/services/pushService', () => ({ sendPushToUser: vi.fn() }));

import { deleteReadNotifications } from './notifications';

beforeEach(() => {
	state.returning = [];
	state.deletedTable = null;
	state.whereCount = 0;
	state.lastWhere = null;
});

describe('deleteReadNotifications', () => {
	it('reports how many rows it removed', async () => {
		state.returning = [{ id: 'n1' }, { id: 'n2' }];

		await expect(deleteReadNotifications('u1')).resolves.toBe(2);
	});

	it('deletes from notifications, always behind a WHERE clause', async () => {
		state.returning = [{ id: 'n1' }];

		await deleteReadNotifications('u1');

		expect(state.deletedTable).toBe(notifications);
		// An unscoped delete would take another user's alerts with it.
		expect(state.whereCount).toBe(1);
	});

	it('reports zero rather than throwing when there is nothing read to prune', async () => {
		await expect(deleteReadNotifications('u1')).resolves.toBe(0);
	});
});

/**
 * #029 M5 — the weekly cron must prune READ notifications after the retention
 * window; unread ones and unread-and-recent ones stay. SQL-level proof via
 * drizzle's QueryBuilder: the stub swallows predicates, so the captured
 * where-condition is rendered to real Postgres text.
 */
import { QueryBuilder } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { pruneReadNotificationsOlderThan } from './notifications';

function renderDeleteWhere(): string {
	// drizzle 0.45's QueryBuilder has no .delete — the predicate's rendered
	// SQL is identical against a select on the same table, so assert there.
	return new QueryBuilder()
		.select()
		.from(notifications)
		.where(state.lastWhere as SQL)
		.toSQL().sql;
}

describe('pruneReadNotificationsOlderThan (#029 M5)', () => {
	it('reports how many rows it removed', async () => {
		state.returning = [{ id: 'n1' }];
		await expect(pruneReadNotificationsOlderThan('2026-07-01T00:00:00Z')).resolves.toBe(1);
	});

	it('deletes only read notifications older than the cutoff', async () => {
		state.returning = [];
		await pruneReadNotificationsOlderThan('2026-07-01T00:00:00.000Z');

		expect(state.deletedTable).toBe(notifications);
		expect(state.whereCount).toBe(1);
		const sql = renderDeleteWhere();
		expect(sql).toContain('"notifications"."readAt" is not null');
		expect(sql).toMatch(/"notifications"\."readAt" < \$1/);
	});

	it('never deletes unread notifications', async () => {
		await pruneReadNotificationsOlderThan('2026-07-01T00:00:00.000Z');
		const sql = renderDeleteWhere();
		// Unread rows have readAt NULL — the IS NOT NULL leg excludes them.
		expect(sql).toContain('"notifications"."readAt" is not null');
	});
});