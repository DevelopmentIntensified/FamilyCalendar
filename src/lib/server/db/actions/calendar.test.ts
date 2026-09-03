import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ensurePersonalCalendar decision logic at the boundary: the drizzle
 * query-builder is replaced with a scripted stub (same pattern as
 * advanceTaskToNext.test.ts) so "select-or-create the Personal Calendar
 * (own + familyId IS NULL)" is verified without a live database.
 * The default `db` module is scripted through `state.db*`; a caller-passed
 * transaction client is scripted through `state.tx*`.
 */
const state = vi.hoisted(() => ({
	dbQueue: [] as unknown[][],
	dbInsertReturn: null as unknown[] | null,
	txQueue: [] as unknown[][],
	txInsertReturn: null as unknown[] | null
}));

vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve((state.dbQueue.shift() ?? []) as unknown[])
			})
		}),
		insert: () => ({
			values: () => ({
				returning: () => Promise.resolve(state.dbInsertReturn ?? [])
			})
		})
	}
}));

/** A standalone transaction-shaped client scripted against the tx queues. */
function makeTx() {
	return {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve((state.txQueue.shift() ?? []) as unknown[])
			})
		}),
		insert: () => ({
			values: () => ({
				returning: () => Promise.resolve(state.txInsertReturn ?? [])
			})
		})
	};
}

import { ensurePersonalCalendar } from './calendar';

beforeEach(() => {
	state.dbQueue = [];
	state.dbInsertReturn = null;
	state.txQueue = [];
	state.txInsertReturn = null;
});

describe('ensurePersonalCalendar', () => {
	it('returns the existing Personal Calendar when present', async () => {
		const existing = { id: 'cal-1', ownerId: 'user-1', familyId: null };
		state.dbQueue.push([existing]);

		const cal = await ensurePersonalCalendar('user-1');

		// No insert happened for the present case.
		expect(cal).toEqual(existing);
		expect(state.dbQueue).toEqual([]);
	});

	it('creates the Personal Calendar when absent', async () => {
		state.dbQueue.push([]); // no existing row
		state.dbInsertReturn = [{ id: 'cal-2', ownerId: 'user-1', familyId: null }];

		const cal = await ensurePersonalCalendar('user-1');

		expect(cal).toEqual({ id: 'cal-2', ownerId: 'user-1', familyId: null });
	});

	it('uses the provided transaction client when given tx', async () => {
		const tx = makeTx();
		state.txQueue.push([]); // no existing row on the tx
		state.txInsertReturn = [{ id: 'cal-3', ownerId: 'user-1', familyId: null }];

		const cal = await ensurePersonalCalendar('user-1', tx as never);

		expect(cal).toEqual({ id: 'cal-3', ownerId: 'user-1', familyId: null });
		// The default db must NOT have been touched (no-tx path untouched).
		expect(state.dbQueue).toEqual([]);
		// The tx insert chain was the only insert driven.
		expect(state.txQueue).toEqual([]);
	});
});
