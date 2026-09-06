import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Bills action tests. The drizzle query-builder is scripted (same pattern as
 * calendar.test.ts); permission predicates are pure and need no stub.
 * Justified mock: see docs/issues/002.
 */
/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null | Date>;

interface StubState {
	selectQueue: Row[][];
	insertValues: Row | null;
	insertReturn: Row[];
	updateValues: Row | null;
	updateReturn: Row[];
	deleteReturn: Row[];
}

const state = vi.hoisted(
	(): StubState => ({
		selectQueue: [],
		insertValues: null,
		insertReturn: [],
		updateValues: null,
		updateReturn: [],
		deleteReturn: []
	})
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: () => Promise.resolve(state.selectQueue.shift() ?? []),
					limit: () => Promise.resolve(state.selectQueue.shift() ?? [])
				})
			})
		}),
		insert: () => ({
			values: (v: Row) => {
				state.insertValues = v;
				return {
					returning: () => Promise.resolve(state.insertReturn)
				};
			}
		}),
		update: () => ({
			set: (v: Row) => {
				state.updateValues = v;
				return {
					where: () => ({
						returning: () => Promise.resolve(state.updateReturn)
					})
				};
			}
		}),
		delete: () => ({
			where: () => ({
				returning: () => Promise.resolve(state.deleteReturn)
			})
		})
	}
}));

import {
	createBill,
	getBillsForUser,
	updateBill,
	deleteBill,
	canMutateBill,
	normalizeBillCategory,
	normalizeAmountCents
} from './bills';
import type { Bill } from '$lib/server/db/schema';

function bill(over: Partial<Bill> = {}): Bill {
	return {
		id: 'bill-1',
		title: 'Electric',
		amountCents: 12000,
		dueDate: '2026-09-15T00:00:00.000Z',
		category: 'utilities',
		paidAt: null,
		userId: 'u1',
		familyId: 'f1',
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

beforeEach(() => {
	state.selectQueue = [];
	state.insertValues = null;
	state.insertReturn = [];
	state.updateValues = null;
	state.updateReturn = [];
	state.deleteReturn = [];
});

describe('normalizeBillCategory', () => {
	const cases: [unknown, string][] = [
		['housing', 'housing'],
		['utilities', 'utilities'],
		['subscriptions', 'subscriptions'],
		['insurance', 'insurance'],
		['other', 'other'],
		['HOUSING', 'other'],
		['rent', 'other'],
		['', 'other'],
		[null, 'other'],
		[undefined, 'other'],
		[42, 'other']
	];
	for (const [raw, expected] of cases) {
		it(`maps ${JSON.stringify(raw)} to ${expected}`, () => {
			expect(normalizeBillCategory(raw)).toBe(expected);
		});
	}
});

describe('normalizeAmountCents', () => {
	const cases: [unknown, number | null][] = [
		[12.5, 1250],
		['12.50', 1250],
		[12000, 1200000],
		[0, 0],
		['0', 0],
		[-5, null],
		['-5', null],
		['abc', null],
		['', null],
		[null, null],
		[undefined, null],
		[Number.NaN, null]
	];
	for (const [raw, expected] of cases) {
		it(`maps ${JSON.stringify(raw)} to ${expected}`, () => {
			expect(normalizeAmountCents(raw)).toBe(expected);
		});
	}
});

describe('createBill', () => {
	it('inserts integer cents and returns the row', async () => {
		const row = bill();
		state.insertReturn = [row];

		const created = await createBill({
			title: 'Electric',
			amountCents: 12000,
			dueDate: '2026-09-15T00:00:00.000Z',
			category: 'utilities',
			userId: 'u1',
			familyId: 'f1'
		});

		expect(created).toEqual(row);
		expect(state.insertValues).toMatchObject({ title: 'Electric', amountCents: 12000 });
	});
});

describe('getBillsForUser', () => {
	it('returns family plus personal bills', async () => {
		state.selectQueue.push([bill(), bill({ id: 'bill-2', familyId: null })]);

		const rows = await getBillsForUser('u1', 'f1');

		expect(rows).toHaveLength(2);
	});
});

describe('canMutateBill', () => {
	it('allows the owner regardless of role', () => {
		expect(canMutateBill(bill({ userId: 'u1' }), 'u1', 'member')).toBe(true);
		expect(canMutateBill(bill({ userId: 'u1' }), 'u1', null)).toBe(true);
	});

	it('allows creator and admin roles', () => {
		expect(canMutateBill(bill({ userId: 'u9' }), 'u1', 'creator')).toBe(true);
		expect(canMutateBill(bill({ userId: 'u9' }), 'u1', 'admin')).toBe(true);
	});

	it('denies plain members and strangers', () => {
		expect(canMutateBill(bill({ userId: 'u9' }), 'u1', 'member')).toBe(false);
		expect(canMutateBill(bill({ userId: 'u9' }), 'u1', null)).toBe(false);
		expect(canMutateBill(bill({ userId: 'u9' }), 'u1', 'superuser')).toBe(false);
	});
});

describe('updateBill', () => {
	it('writes the patch when permitted', async () => {
		state.selectQueue.push([bill()]);
		state.updateReturn = [bill({ title: 'Electric (new)' })];

		const updated = await updateBill('bill-1', 'u1', 'admin', { title: 'Electric (new)' });

		expect(updated?.title).toBe('Electric (new)');
		expect(state.updateValues).toMatchObject({ title: 'Electric (new)' });
	});

	it('writes nothing when forbidden', async () => {
		state.selectQueue.push([bill({ userId: 'u9' })]);

		const updated = await updateBill('bill-1', 'u1', 'member', { title: 'Hijacked' });

		expect(updated).toBeNull();
		expect(state.updateValues).toBeNull();
	});

	it('returns null for a missing bill', async () => {
		state.selectQueue.push([]);

		expect(await updateBill('nope', 'u1', 'admin', { title: 'x' })).toBeNull();
	});
});

describe('deleteBill', () => {
	it('deletes when permitted', async () => {
		state.selectQueue.push([bill()]);
		state.deleteReturn = [bill()];

		expect(await deleteBill('bill-1', 'u1', 'creator')).toBe(true);
	});

	it('deletes nothing when forbidden', async () => {
		state.selectQueue.push([bill({ userId: 'u9' })]);

		expect(await deleteBill('bill-1', 'u1', 'member')).toBe(false);
		expect(state.deleteReturn).toEqual([]);
	});
});
