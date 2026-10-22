import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createUser, deleteUser } from './users';
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
/** The slice of the drizzle transaction client deleteUser + createUser use. */
interface TxStub {
	update(table: typeof tasks): {
		set(patch: { assignmentStatus: string }): { where(): Promise<void> };
	};
	delete(table: typeof users | typeof subscriptions): { where(): Promise<void> };
	insert(table: unknown): {
		values(values: Record<string, unknown>): { returning(): Promise<Record<string, unknown>[]> };
	};
}

/** Write-order log: literal table tags pushed by the stubbed tx. */
interface StubState {
	order: ('tasks' | 'subscriptions' | 'users' | 'unknown')[];
	statusPatch: unknown;
	inserts: ('users' | 'authAccount' | 'unknown')[];
	insertValues: Record<string, unknown>[];
}

const state = vi.hoisted(
	(): StubState => ({ order: [], statusPatch: null, inserts: [], insertValues: [] })
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins the transaction + write order; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		transaction: async (run: (tx: TxStub) => Promise<void>) => {
			const { users, subscriptions, tasks, authAccount } = await import('$lib/server/db/schema');
			// Same scripted insert for db and tx paths; the schema import stays
			// dynamic because vi.mock factories are hoisted above module scope
			// (a static value import would hit TDZ at mock-definition time).
			// The table tag resolves eagerly (callers that don't need the row
			// back never call .returning()), values recorded at .values() time.
			const recordInsert = (table: unknown) => {
				const tag: 'users' | 'authAccount' | 'unknown' =
					table === users ? 'users' : table === authAccount ? 'authAccount' : 'unknown';
				return {
					values: (values: Record<string, unknown>) => {
						state.inserts.push(tag);
						state.insertValues.push(values);
						return { returning: async () => [values] };
					}
				};
			};
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
				}),
				insert: recordInsert
			};
			return await run(tx);
		},
		// Same eager-tag scripted insert for the non-transactional path
		// (createUser without passwordHash). Schema import stays dynamic:
		// vi.mock factories are hoisted above module scope.
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => ({
				returning: async () => {
					const { users, authAccount } = await import('$lib/server/db/schema');
					state.inserts.push(
						table === users ? 'users' : table === authAccount ? 'authAccount' : 'unknown'
					);
					state.insertValues.push(values);
					return [values];
				}
			})
		})
	}
}));

beforeEach(() => {
	state.order = [];
	state.statusPatch = null;
	state.inserts = [];
	state.insertValues = [];
});

describe('deleteUser', () => {
	it('resets assignment status, then deletes subscriptions before the user row, in one transaction', async () => {
		await deleteUser('user-1');

		expect(state.order).toEqual(['tasks', 'subscriptions', 'users']);
		expect(state.statusPatch).toEqual({ assignmentStatus: 'none' });
	});
});

describe('createUser (#196 slice 5: better-auth credential parity)', () => {
	it('with a passwordHash, writes the user row AND its credential account row in one transaction', async () => {
		const user = await createUser({
			id: 'user-2',
			email: 'delivered+pw-signup@resend.dev',
			passwordHash: '$2a$12$fakebcrypthash0000000000000000000000000000000000000000000000',
			firstName: 'Pat',
			lastName: 'Smith',
			emailVerified: false
		});

		expect(user.id).toBe('user-2');
		expect(state.inserts).toEqual(['users', 'authAccount']);
		expect(state.insertValues[0]).toMatchObject({ id: 'user-2', passwordHash: expect.stringMatching(/^\$2a\$/) });
		// Mirrors migration 018's backfill shape exactly (pw- prefix ids).
		expect(state.insertValues[1]).toEqual({
			id: 'pw-user-2',
			userId: 'user-2',
			providerId: 'credential',
			accountId: 'user-2',
			password: '$2a$12$fakebcrypthash0000000000000000000000000000000000000000000000'
		});
	});

	it('without a passwordHash, writes only the user row (guests/OAuth users get no credential account)', async () => {
		await createUser({
			id: 'user-3',
			email: 'user+3@user.com',
			firstName: 'Guest',
			lastName: '',
			emailVerified: true
		});

		expect(state.inserts).toEqual(['users']);
	});
});
