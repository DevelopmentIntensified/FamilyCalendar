import type { Bill, BillCategory, ReceiptItem } from '$lib/server/db/schema';
import { normalizeTagKey } from './tagTable';

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

// ── Spending Reports (#032) — month-range folds over the same data ──────

/** 'YYYY-MM' month-key pair bounding a report range (inclusive). */
export interface MonthRange {
	from: string;
	to: string;
}

export type SpendRangePreset =
	| 'this-month'
	| 'last-month'
	| 'last-3'
	| 'last-6'
	| 'this-year'
	| 'all'
	| 'custom';

/** 'YYYY-MM' from UTC year + 0-based month. */
function monthKey(year: number, month0: number): string {
	return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

/**
 * Month bounds for a range preset, UTC-anchored on `now`. 'all' (and any
 * unrecognized preset) returns null — the caller shows every month present.
 * 'custom' is resolved by the caller from the from/to inputs.
 */
export function presetMonthRange(preset: string, now: Date = new Date()): MonthRange | null {
	const y = now.getUTCFullYear();
	const m = now.getUTCMonth(); // 0-based
	switch (preset) {
		case 'this-month':
			return { from: monthKey(y, m), to: monthKey(y, m) };
		case 'last-month':
			return m === 0
				? { from: monthKey(y - 1, 11), to: monthKey(y - 1, 11) }
				: { from: monthKey(y, m - 1), to: monthKey(y, m - 1) };
		case 'last-3':
			return shiftMonths({ from: monthKey(y, m - 2), to: monthKey(y, m) });
		case 'last-6':
			return shiftMonths({ from: monthKey(y, m - 5), to: monthKey(y, m) });
		case 'this-year':
			return { from: `${y}-01`, to: monthKey(y, m) };
		default:
			return null;
	}
}

/** Normalizes negative month0 arithmetic (e.g. January − 1 → prior December). */
function shiftMonths(range: MonthRange): MonthRange {
	const norm = (k: string) => {
		const y = Number(k.slice(0, 4));
		const m = Number(k.slice(5, 7)) - 1;
		return monthKey(y + Math.floor(m / 12), ((m % 12) + 12) % 12);
	};
	return { from: norm(range.from), to: norm(range.to) };
}

/**
 * Inclusive list of 'YYYY-MM' keys from `from` to `to`, oldest first.
 * Reversed bounds are swapped; malformed keys yield [].
 */
export function monthKeysBetween(from: string, to: string): string[] {
	if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return [];
	if (from > to) [from, to] = [to, from];
	const keys: string[] = [];
	let [y, m] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
	const endY = Number(to.slice(0, 4));
	const endM = Number(to.slice(5, 7));
	// SAFETY: bounded by 12 months/year; a runaway loop is impossible since
	// both bounds are validated YYYY-MM.
	while (y < endY || (y === endY && m <= endM)) {
		keys.push(`${y}-${String(m).padStart(2, '0')}`);
		m += 1;
		if (m > 12) {
			m = 1;
			y += 1;
		}
	}
	return keys;
}

/**
 * Dated bills whose UTC dueDate month falls inside the inclusive month-key
 * range. Undated bills are excluded — under 'all' they surface in the
 * separate Undated row instead of belonging to no month.
 */
export function billsInMonthRange(bills: Bill[], from: string, to: string): Bill[] {
	if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return [];
	const [lo, hi] = from <= to ? [from, to] : [to, from];
	return bills.filter((bill) => {
		if (!bill.dueDate) return false;
		const month = bill.dueDate.slice(0, 7);
		return month >= lo && month <= hi;
	});
}

/** One month's category slices, keyed by its 'YYYY-MM' bucket. */
export interface MonthBucket {
	month: string;
	spend: SpendSlice[];
}

/**
 * Folds dated bills into one SpendSlice[] per requested month, in the
 * given order. Months with no bills still get an (empty) bucket so the
 * trend view shows the gap; undated bills never land in a bucket.
 */
export function spendByMonth(
	bills: Bill[],
	itemsByBillId: Map<string, ReceiptItem[]>,
	months: string[]
): MonthBucket[] {
	return months.map((month) => ({
		month,
		spend: spendByCategory(billsInMonth(bills, month), itemsByBillId)
	}));
}

/** An aggregated Line Item label across the range: frequency + total. */
export interface TopItem {
	label: string;
	category: BillCategory;
	count: number;
	cents: number;
}

/**
 * Aggregates Line Item labels for the given (in-range) bills — the Top
 * Items card. Grouped by normalized label (same normalization as the Tag
 * Table); the first-seen casing wins as the display label. Unlabeled
 * items inherit the bill's category. Sorted by total cents descending.
 */
export function topItems(
	bills: Bill[],
	itemsByBillId: Map<string, ReceiptItem[]>,
	limit = 8
): TopItem[] {
	const groups = new Map<
		string,
		{ label: string; category: BillCategory; count: number; cents: number }
	>();
	for (const bill of bills) {
		for (const item of itemsByBillId.get(bill.id) ?? []) {
			const key = normalizeTagKey(item.label);
			if (!key) continue;
			// SAFETY: validated at write (normalizeBillItems) — see spendByCategory.
			const category = (item.category ?? bill.category) as BillCategory;
			const group = groups.get(key);
			if (group) {
				group.count += 1;
				group.cents += item.priceCents;
			} else {
				groups.set(key, { label: item.label, category, count: 1, cents: item.priceCents });
			}
		}
	}
	return [...groups.values()].sort((a, b) => b.cents - a.cents).slice(0, limit);
}

// ── Merchant reporting (#035) ─────────────────────────────────────

/** One merchant's spend: display title, total cents, bill count + ids. */
export interface MerchantSlice {
	merchant: string;
	cents: number;
	count: number;
	billIds: string[];
}

/**
 * Groups bills by normalized merchant (title lowercased/trimmed, inner
 * whitespace collapsed); the first-seen casing wins as the display title.
 * Unconfirmed drafts (source !== 'manual', same coalescing as the spending
 * page load) and blank titles never count as spend. Sorted by total cents
 * descending, capped at `limit`. Operates on the caller's (in-range) bills
 * — same shape as topItems.
 */
export function spendByMerchant(bills: Bill[], limit = 8): MerchantSlice[] {
	const groups = new Map<string, MerchantSlice>();
	for (const bill of bills) {
		if ((bill.source ?? 'manual') !== 'manual') continue;
		const key = bill.title.toLowerCase().trim().replace(/\s+/g, ' ');
		if (!key) continue;
		const group = groups.get(key);
		if (group) {
			group.cents += bill.amountCents;
			group.count += 1;
			group.billIds.push(bill.id);
		} else {
			groups.set(key, {
				merchant: bill.title.trim(),
				cents: bill.amountCents,
				count: 1,
				billIds: [bill.id]
			});
		}
	}
	return [...groups.values()].sort((a, b) => b.cents - a.cents).slice(0, limit);
}
