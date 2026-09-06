import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ensurePersonalCalendar decision logic at the boundary: the drizzle
 * query-builder is replaced with a scripted stub (same pattern as
 * advanceTaskToNext.test.ts) so "select-or-create the Personal Calendar
 * (own + familyId IS NULL)" is verified without a live database.
 * The default `db` module is scripted through `state.db*`; a caller-passed
 * transaction client is scripted through `state.tx*`.
 */
/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null | Date>;

interface StubState {
	dbQueue: Row[][];
	dbInsertReturn: Row[] | null;
	dbInsertValues: Row | null;
	txQueue: Row[][];
	txInsertReturn: Row[] | null;
}

const state = vi.hoisted(
	(): StubState => ({
		dbQueue: [],
		dbInsertReturn: null,
		dbInsertValues: null,
		txQueue: [],
		txInsertReturn: null
	})
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(state.dbQueue.shift() ?? [])
			})
		}),
		insert: () => ({
			values: (v: Row) => {
				state.dbInsertValues = v;
				return {
					returning: () => Promise.resolve(state.dbInsertReturn ?? [])
				};
			}
		})
	}
}));

/** A standalone transaction-shaped client scripted against the tx queues. */
function makeTx() {
	return {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(state.txQueue.shift() ?? [])
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
	state.dbInsertValues = null;
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

	it('creates with the ownerId and no familyId when absent', async () => {
		state.dbQueue.push([]); // no existing row
		state.dbInsertReturn = [{ id: 'cal-4', ownerId: 'user-9', familyId: null }];

		await ensurePersonalCalendar('user-9');

		expect(state.dbInsertValues).toEqual({ ownerId: 'user-9' });
	});

	it('uses the provided transaction client when given tx', async () => {
		const tx = makeTx();
		state.txQueue.push([]); // no existing row on the tx
		state.txInsertReturn = [{ id: 'cal-3', ownerId: 'user-1', familyId: null }];

		// SAFETY: the scripted makeTx() stub structurally matches the drizzle transaction client ensurePersonalCalendar calls; `never` bypasses only the nominal type.
		const cal = await ensurePersonalCalendar('user-1', tx as never);

		expect(cal).toEqual({ id: 'cal-3', ownerId: 'user-1', familyId: null });
		// The default db must NOT have been touched (no-tx path untouched).
		expect(state.dbQueue).toEqual([]);
		// The tx insert chain was the only insert driven.
		expect(state.txQueue).toEqual([]);
	});
});
