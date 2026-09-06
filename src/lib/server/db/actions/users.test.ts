import { describe, it, expect, vi } from 'vitest';
// Type-only: the factory below dynamic-imports these to dodge TDZ during mock init.
import type { users, subscriptions } from '$lib/server/db/schema';

/**
 * deleteUser cascade contract: `activeSubscriptions.userId` is the only
 * user FK with `onDelete: 'no action'`, so the subscription rows must
 * be removed BEFORE the user row or Postgres rejects the delete
 * (account deletion would 500 after the session was already
 * invalidated). Scripted stub records the delete order — same pattern
 * as calendar.test.ts.
 */
/** The slice of the drizzle transaction client deleteUser uses. */
interface TxStub {
	delete(table: typeof users | typeof subscriptions): { where(): Promise<void> };
}

/** Delete-order log: literal table tags pushed by the stubbed tx. */
interface StubState {
	order: ('subscriptions' | 'users' | 'unknown')[];
}

const state = vi.hoisted((): StubState => ({ order: [] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins the transaction + delete order; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		transaction: async (run: (tx: TxStub) => Promise<void>) => {
			const { users, subscriptions } = await import('$lib/server/db/schema');
			const tx: TxStub = {
				delete: (table) => ({
					where: async () => {
						state.order.push(
							table === subscriptions ? 'subscriptions' : table === users ? 'users' : 'unknown'
						);
					}
				})
			};
			await run(tx);
		}
	}
}));

import { deleteUser } from './users';

describe('deleteUser', () => {
	it('deletes activeSubscriptions rows before the user row, in one transaction', async () => {
		await deleteUser('user-1');

		expect(state.order).toEqual(['subscriptions', 'users']);
	});
});
