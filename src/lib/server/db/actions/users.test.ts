import { describe, it, expect, vi } from 'vitest';
// Type-only: the factory below dynamic-imports these to dodge TDZ during mock init.
import type { users, subscriptions, tasks } from '$lib/server/db/schema';

/**
 * deleteUser contract, in ONE transaction:
 * 1. tasks.assignedTo is set-nulled by the users delete's FK action — the
 *    assignment status must be reset to 'none' BEFORE that, or the
 *    un-assigned task keeps a ghost 'pending'/'accepted' status.
 * 2. `activeSubscriptions.userId` is the only user FK with
 *    `onDelete: 'no action'`, so the subscription rows must be removed
 *    BEFORE the user row or Postgres rejects the delete (account deletion
 *    would 500 after the session was already invalidated).
 * Scripted stub records the write order — same pattern as calendar.test.ts.
 */
/** The slice of the drizzle transaction client deleteUser uses. */
interface TxStub {
	update(table: typeof tasks): {
		set(patch: { assignmentStatus: string }): { where(): Promise<void> };
	};
	delete(table: typeof users | typeof subscriptions): { where(): Promise<void> };
}

/** Write-order log: literal table tags pushed by the stubbed tx. */
interface StubState {
	order: ('tasks' | 'subscriptions' | 'users' | 'unknown')[];
	statusPatch: unknown;
}

const state = vi.hoisted((): StubState => ({ order: [], statusPatch: null }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins the transaction + write order; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		transaction: async (run: (tx: TxStub) => Promise<void>) => {
			const { users, subscriptions, tasks } = await import('$lib/server/db/schema');
			const tx: TxStub = {
				update: (table) => ({
					set: (patch: { assignmentStatus: string }) => ({
						where: async () => {
							if (table === tasks) {
								state.order.push('tasks');
								state.statusPatch = patch;
							} else {
								state.order.push('unknown');
							}
						}
					})
				}),
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
	it('resets assignment status, then deletes subscriptions before the user row, in one transaction', async () => {
		await deleteUser('user-1');

		expect(state.order).toEqual(['tasks', 'subscriptions', 'users']);
		expect(state.statusPatch).toEqual({ assignmentStatus: 'none' });
	});
});
