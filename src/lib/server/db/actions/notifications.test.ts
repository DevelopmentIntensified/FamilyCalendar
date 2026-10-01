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
}

const state = vi.hoisted(
	(): ScriptedState => ({ returning: [], deletedTable: null, whereCount: 0 })
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- db is infra; the predicate is what is under test.
vi.mock('$lib/server/db', () => ({
	db: {
		delete: (table: PgTable) => {
			state.deletedTable = table;
			return {
				where: () => {
					state.whereCount++;
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