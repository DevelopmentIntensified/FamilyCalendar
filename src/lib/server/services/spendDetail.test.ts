import { describe, it, expect } from 'vitest';
import type { Bill, ReceiptItem } from '$lib/server/db/schema';
import { spendByCategory, billsInMonth, currentMonthKey } from './spendDetail';

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
