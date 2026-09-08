import { describe, it, expect } from 'vitest';
import type { Bill, ReceiptItem } from '$lib/server/db/schema';
import {
	spendByCategory,
	billsInMonth,
	currentMonthKey,
	presetMonthRange,
	monthKeysBetween,
	billsInMonthRange,
	spendByMonth,
	topItems
} from './spendDetail';

/** A Bill fixture; the aggregation reads only id/amountCents/category/dueDate. */
function bill(over: Partial<Bill> = {}): Bill {
	return {
		id: 'bill-1',
		title: 'Kroger',
		amountCents: 5000,
		dueDate: null,
		category: 'other',
		paidAt: null,
		source: 'manual',
		userId: 'u1',
		familyId: null,
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

/** A ReceiptItem fixture; aggregation reads billId/priceCents/category. */
function item(over: Partial<ReceiptItem> = {}): ReceiptItem {
	return {
		id: 'ri-1',
		billId: 'bill-1',
		label: 'Milk',
		priceCents: 349,
		category: null,
		position: 0,
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

describe('spendByCategory', () => {
	it('splits a billed-with-items bill across its Line Item Labels', () => {
		const b = bill({ id: 'b1', category: 'other' });
		const got = spendByCategory(
			[b],
			new Map([
				[
					'b1',
					[
						item({ billId: 'b1', priceCents: 349, category: 'utilities' }),
						item({ billId: 'b1', priceCents: 651, category: null })
					]
				]
			])
		);

		// 'utilities' labeled item + unlabeled item inheriting the bill's 'other'.
		expect(got).toEqual([
			{ category: 'other', cents: 651, billIds: ['b1'] },
			{ category: 'utilities', cents: 349, billIds: ['b1'] }
		]);
	});

	it('puts an item-less bill entirely under its own category', () => {
		const got = spendByCategory(
			[bill({ id: 'b1', amountCents: 12000, category: 'utilities' })],
			new Map()
		);

		expect(got).toEqual([{ category: 'utilities', cents: 12000, billIds: ['b1'] }]);
	});

	it('merges same-category slices across bills', () => {
		const groceries = bill({ id: 'b1', category: 'other', amountCents: 1000 });
		const utilities = bill({ id: 'b2', category: 'utilities', amountCents: 500 });
		const got = spendByCategory(
			[groceries, utilities],
			new Map([
				['b1', [item({ billId: 'b1', priceCents: 1000, category: 'utilities' })]],
				['b2', []]
			])
		);

		expect(got).toEqual(
			[
				{ category: 'utilities', cents: 1500, billIds: ['b1', 'b2'] },
				{ category: 'other', cents: 0, billIds: [] }
			].filter((slice) => slice.cents > 0)
		);
	});

	it('sorts slices by cents descending', () => {
		const got = spendByCategory(
			[
				bill({ id: 'b1', amountCents: 100, category: 'tax' }),
				bill({ id: 'b2', amountCents: 900, category: 'fees' }),
				bill({ id: 'b3', amountCents: 500, category: 'housing' })
			],
			new Map()
		);

		expect(got.map((slice) => slice.category)).toEqual(['fees', 'housing', 'tax']);
	});

	it('returns an empty slice set for no bills', () => {
		expect(spendByCategory([], new Map())).toEqual([]);
	});

	it('maps tax and fees line items into their own categories (#031)', () => {
		const b = bill({ id: 'b1', category: 'subscriptions' });
		const got = spendByCategory(
			[b],
			new Map([
				[
					'b1',
					[
						item({ billId: 'b1', priceCents: 1200, category: 'subscriptions' }),
						item({ billId: 'b1', priceCents: 96, category: 'tax' }),
						item({ billId: 'b1', priceCents: 299, category: 'fees' })
					]
				]
			])
		);

		expect(got).toEqual([
			{ category: 'subscriptions', cents: 1200, billIds: ['b1'] },
			{ category: 'fees', cents: 299, billIds: ['b1'] },
			{ category: 'tax', cents: 96, billIds: ['b1'] }
		]);
	});
});

describe('billsInMonth', () => {
	const cases: Array<[string, string[], string[]]> = [
		['2026-09', ['b-sep1', 'b-sep2'], ['b-aug', 'b-undated']],
		['2026-08', ['b-aug'], ['b-sep1', 'b-undated']]
	];
	for (const [month, included, excluded] of cases) {
		it(`filters bills to ${month}`, () => {
			const bills = [
				bill({ id: 'b-sep1', dueDate: '2026-09-01T00:00:00.000Z' }),
				bill({ id: 'b-sep2', dueDate: '2026-09-30T23:59:59.000Z' }),
				bill({ id: 'b-aug', dueDate: '2026-08-15T00:00:00.000Z' }),
				bill({ id: 'b-undated', dueDate: null })
			];
			const got = billsInMonth(bills, month);
			expect(got.map((b) => b.id).sort()).toEqual([...included].sort());
			for (const id of excluded) {
				expect(got.map((b) => b.id)).not.toContain(id);
			}
		});
	}

	it('treats an invalid month key as empty', () => {
		expect(billsInMonth([bill()], 'not-a-month')).toEqual([]);
	});
});

describe('currentMonthKey', () => {
	it('formats the current UTC month as YYYY-MM', () => {
		expect(currentMonthKey(new Date('2026-09-07T23:30:00Z'))).toBe('2026-09');
		expect(currentMonthKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
	});
});

describe('presetMonthRange (#032)', () => {
	const now = new Date('2026-09-07T12:00:00Z');
	const cases: Array<[string, { from: string; to: string } | null]> = [
		['this-month', { from: '2026-09', to: '2026-09' }],
		['last-month', { from: '2026-08', to: '2026-08' }],
		['last-3', { from: '2026-07', to: '2026-09' }],
		['last-6', { from: '2026-04', to: '2026-09' }],
		['this-year', { from: '2026-01', to: '2026-09' }],
		['all', null]
	];
	for (const [preset, expected] of cases) {
		it(`maps '${preset}'`, () => {
			expect(presetMonthRange(preset, now)).toEqual(expected);
		});
	}

	it('rolls back across the year boundary for last-month', () => {
		expect(presetMonthRange('last-month', new Date('2026-01-15T00:00:00Z'))).toEqual({
			from: '2025-12',
			to: '2025-12'
		});
	});

	it('returns this-year spanning January of a January date', () => {
		expect(presetMonthRange('this-year', new Date('2026-01-01T00:00:00Z'))).toEqual({
			from: '2026-01',
			to: '2026-01'
		});
	});

	it('treats an unknown preset as all-time', () => {
		expect(presetMonthRange('nonsense', now)).toBeNull();
	});
});

describe('monthKeysBetween (#032)', () => {
	it('lists months inclusive, oldest first', () => {
		expect(monthKeysBetween('2026-07', '2026-09')).toEqual(['2026-07', '2026-08', '2026-09']);
	});

	it('returns a single month when from === to', () => {
		expect(monthKeysBetween('2026-09', '2026-09')).toEqual(['2026-09']);
	});

	it('spans a year boundary', () => {
		expect(monthKeysBetween('2025-11', '2026-02')).toEqual([
			'2025-11',
			'2025-12',
			'2026-01',
			'2026-02'
		]);
	});

	it('swaps reversed bounds instead of returning nothing', () => {
		expect(monthKeysBetween('2026-09', '2026-07')).toEqual(['2026-07', '2026-08', '2026-09']);
	});

	it('rejects malformed keys', () => {
		expect(monthKeysBetween('2026-9', '2026-10')).toEqual([]);
		expect(monthKeysBetween('', '2026-10')).toEqual([]);
	});
});

describe('billsInMonthRange (#032)', () => {
	const bills = [
		bill({ id: 'b-jan', dueDate: '2026-01-05T00:00:00.000Z' }),
		bill({ id: 'b-jul', dueDate: '2026-07-31T23:59:59.000Z' }),
		bill({ id: 'b-aug', dueDate: '2026-08-15T00:00:00.000Z' }),
		bill({ id: 'b-sep', dueDate: '2026-09-01T00:00:00.000Z' }),
		bill({ id: 'b-undated', dueDate: null })
	];

	it('includes only dated bills whose month falls inside the range', () => {
		const got = billsInMonthRange(bills, '2026-07', '2026-09');
		expect(got.map((b) => b.id).sort()).toEqual(['b-aug', 'b-jul', 'b-sep']);
	});

	it('is inclusive on both bounds', () => {
		expect(billsInMonthRange(bills, '2026-07', '2026-07').map((b) => b.id)).toEqual(['b-jul']);
		expect(billsInMonthRange(bills, '2026-09', '2026-09').map((b) => b.id)).toEqual(['b-sep']);
	});

	it('excludes undated bills always (they surface in the Undated row)', () => {
		expect(billsInMonthRange(bills, '2025-01', '2027-12').map((b) => b.id)).not.toContain(
			'b-undated'
		);
	});

	it('returns nothing for a malformed range', () => {
		expect(billsInMonthRange(bills, 'junk', '2026-09')).toEqual([]);
	});
});

describe('spendByMonth (#032)', () => {
	it('folds one bucket per requested month, in the given order', () => {
		const sep = bill({
			id: 'b-sep',
			amountCents: 9000,
			category: 'utilities',
			dueDate: '2026-09-10T00:00:00.000Z'
		});
		const aug = bill({
			id: 'b-aug',
			amountCents: 4000,
			category: 'other',
			dueDate: '2026-08-02T00:00:00.000Z'
		});
		const got = spendByMonth([sep, aug], new Map(), ['2026-08', '2026-09']);

		expect(got.map((bucket) => bucket.month)).toEqual(['2026-08', '2026-09']);
		expect(got[0].spend).toEqual([{ category: 'other', cents: 4000, billIds: ['b-aug'] }]);
		expect(got[1].spend).toEqual([{ category: 'utilities', cents: 9000, billIds: ['b-sep'] }]);
	});

	it('emits an empty bucket for months with no bills', () => {
		const got = spendByMonth([], new Map(), ['2026-07', '2026-08']);
		expect(got).toEqual([
			{ month: '2026-07', spend: [] },
			{ month: '2026-08', spend: [] }
		]);
	});

	it('splits item-labeled bills into their month only', () => {
		const b = bill({
			id: 'b1',
			amountCents: 1000,
			category: 'other',
			dueDate: '2026-09-05T00:00:00.000Z'
		});
		const got = spendByMonth(
			[b],
			new Map([['b1', [item({ billId: 'b1', priceCents: 1000, category: 'utilities' })]]]),
			['2026-08', '2026-09']
		);
		expect(got[0].spend).toEqual([]);
		expect(got[1].spend).toEqual([{ category: 'utilities', cents: 1000, billIds: ['b1'] }]);
	});

	it('excludes undated bills from every bucket', () => {
		const got = spendByMonth([bill({ id: 'b-u', dueDate: null })], new Map(), ['2026-09']);
		expect(got).toEqual([{ month: '2026-09', spend: [] }]);
	});
});

describe('topItems (#032)', () => {
	it('groups items across bills by normalized label and sums cents + count', () => {
		const b1 = bill({ id: 'b1', category: 'other', amountCents: 5000 });
		const b2 = bill({ id: 'b2', category: 'other', amountCents: 5000 });
		const got = topItems(
			[b1, b2],
			new Map([
				['b1', [item({ billId: 'b1', label: 'Whole Milk', priceCents: 349 })]],
				['b2', [item({ billId: 'b2', label: 'whole  milk', priceCents: 329 })]]
			])
		);
		expect(got).toEqual([{ label: 'Whole Milk', category: 'other', count: 2, cents: 678 }]);
	});

	it('sorts by total cents descending', () => {
		const b = bill({ id: 'b1', category: 'other' });
		const got = topItems(
			[b],
			new Map([
				[
					'b1',
					[
						item({ billId: 'b1', label: 'Milk', priceCents: 349 }),
						item({ billId: 'b1', label: 'Rent share', priceCents: 90000 }),
						item({ billId: 'b1', label: 'Eggs', priceCents: 500 })
					]
				]
			])
		);
		expect(got.map((t) => t.label)).toEqual(['Rent share', 'Eggs', 'Milk']);
	});

	it('an item without its own category inherits the bill category', () => {
		const b = bill({ id: 'b1', category: 'utilities' });
		const got = topItems(
			[b],
			new Map([
				['b1', [item({ billId: 'b1', label: 'Electricity', category: null, priceCents: 1200 })]]
			])
		);
		expect(got[0].category).toBe('utilities');
	});

	it('only counts items belonging to the given (in-range) bills', () => {
		const inRange = bill({ id: 'b-in', category: 'other' });
		const _outOfRange = bill({ id: 'b-out', category: 'other' });
		const got = topItems(
			[inRange],
			new Map([
				['b-in', [item({ billId: 'b-in', label: 'Milk', priceCents: 349 })]],
				['b-out', [item({ billId: 'b-out', label: 'Milk', priceCents: 9999 })]]
			])
		);
		expect(got).toEqual([{ label: 'Milk', category: 'other', count: 1, cents: 349 }]);
	});

	it('respects the limit', () => {
		const b = bill({ id: 'b1', category: 'other' });
		const got = topItems(
			[b],
			new Map([
				[
					'b1',
					['a', 'b', 'c', 'd', 'e'].map((label, i) =>
						item({ billId: 'b1', label, priceCents: 100 - i })
					)
				]
			]),
			3
		);
		expect(got).toHaveLength(3);
	});

	it('returns empty for bills with no items', () => {
		expect(topItems([bill({ id: 'b1' })], new Map())).toEqual([]);
	});
});
