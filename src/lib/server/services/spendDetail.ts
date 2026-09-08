import type { Bill, BillCategory, ReceiptItem } from '$lib/server/db/schema';

/**
 * Spend Detail (issue 031) — category-level view of where money goes.
 * Computed from Line Item Labels when a Bill has them, and from the Bill's
 * category when it doesn't. Pure + in-memory: the caller fetches bills and
 * their items (one query each) and this folds them into per-category
 * slices — no SQL group-by across the join needed at this scale.
 */

/** One category's spend: total cents and the bills contributing to it. */
export interface SpendSlice {
	category: BillCategory;
	cents: number;
	billIds: string[];
}

/** 'YYYY-MM' month key from a Date, UTC-anchored (dueDate is stored UTC). */
export function currentMonthKey(now: Date = new Date()): string {
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Bills due within the given 'YYYY-MM' (UTC on the stored dueDate).
 * Undated bills have no month to belong to and are excluded; the "All"
 * range view shows them instead.
 */
export function billsInMonth(bills: Bill[], month: string): Bill[] {
	if (!/^\d{4}-\d{2}$/.test(month)) return [];
	return bills.filter((bill) => {
		if (!bill.dueDate) return false;
		return bill.dueDate.slice(0, 7) === month;
	});
}

/**
 * Folds bills + their line items into SpendSlice[] sorted by cents
 * descending. A bill WITH items contributes each item's price under the
 * item's Label category (null inherits the bill's); a bill WITHOUT items
 * contributes its full amount under its own category.
 */
export function spendByCategory(
	bills: Bill[],
	itemsByBillId: Map<string, ReceiptItem[]>
): SpendSlice[] {
	const totals = new Map<BillCategory, { cents: number; billIds: Set<string> }>();
	const add = (category: BillCategory, cents: number, billId: string | null) => {
		const slice = totals.get(category) ?? { cents: 0, billIds: new Set<string>() };
		slice.cents += cents;
		if (billId) slice.billIds.add(billId);
		totals.set(category, slice);
	};

	for (const bill of bills) {
		const items = itemsByBillId.get(bill.id) ?? [];
		if (items.length === 0) {
			// SAFETY: bill.category is a BILL_CATEGORIES literal, validated at
			// write by normalizeBillCategory; the DB text column merely widens
			// the type back to string on read.
			add(bill.category as BillCategory, bill.amountCents, bill.id);
			continue;
		}
		for (const item of items) {
			// SAFETY: item.category is a BILL_CATEGORIES literal when set
			// (validated at write by normalizeBillItems); the DB text column
			// merely widens the type back to string on read.
			add((item.category ?? bill.category) as BillCategory, item.priceCents, bill.id);
		}
	}

	return [...totals.entries()]
		.filter(([, slice]) => slice.cents > 0)
		.map(([category, slice]) => ({
			category,
			cents: slice.cents,
			billIds: [...slice.billIds]
		}))
		.sort((a, b) => b.cents - a.cents);
}
