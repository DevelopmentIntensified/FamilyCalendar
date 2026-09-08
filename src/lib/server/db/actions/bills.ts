import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	bills,
	receiptItems,
	BILL_CATEGORIES,
	type Bill,
	type BillCategory,
	type ReceiptItem
} from '$lib/server/db/schema';

/** Closed bill-category vocabulary; unknown values fall back to 'other'. */
function isBillCategory(value: unknown): value is BillCategory {
	// SAFETY: BILL_CATEGORIES holds exactly the category literals; viewing it
	// as strings makes the membership test exact with no precision lost.
	return typeof value === 'string' && (BILL_CATEGORIES as readonly string[]).includes(value);
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- exported boundary parser: unknown input IS its contract; routes feed it raw request-body fields.
export function normalizeBillCategory(raw: unknown): BillCategory {
	return isBillCategory(raw) ? raw : 'other';
}

/** True for a usable dollar amount in number form. */
function isAmountNumber(raw: unknown): raw is number {
	return typeof raw === 'number';
}

/** True for a non-blank numeric string amount. */
function isAmountString(raw: unknown): raw is string {
	return typeof raw === 'string' && raw.trim() !== '';
}

/**
 * Parses a dollar amount (number or numeric string) into integer cents.
 * Null when the input is not a finite, non-negative amount.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- exported boundary parser: unknown input IS its contract; routes feed it raw request-body fields.
export function normalizeAmountCents(raw: unknown): number | null {
	// SAFETY: numeric-string boundary parser; Number() on a validated
	// non-blank string is the intended coercion, no precision lost.
	const n = isAmountNumber(raw) ? raw : isAmountString(raw) ? Number(raw) : Number.NaN;
	if (!Number.isFinite(n) || n < 0) return null;
	const cents = Math.round(n * 100);
	// Postgres int4 ceiling: reject before the DB turns overflow into a 500.
	if (!Number.isSafeInteger(cents) || cents > 2147483647) return null;
	return cents;
}

/** True when the string is a date the runtime can parse to a real instant. */
function isValidDateString(raw: string): boolean {
	const parsed = Date.parse(raw);
	if (Number.isNaN(parsed)) return false;
	// Round-trip: the normalized ISO form must parse back to the same instant.
	return Date.parse(new Date(parsed).toISOString()) === parsed;
}

/** True for a date-only string (yyyy-MM-dd). */
function isDateOnlyString(raw: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(raw);
}

/** Result of parsing a dueDate request field: anchored value, cleared, or invalid. */
export type DueDateParse = { status: 'ok'; value: string | null } | { status: 'invalid' };

/**
 * Parses a dueDate request field. Null/blank clears the field; a valid date
 * string is kept (date-only form anchored to explicit UTC midnight so the
 * timestamptz cast is timezone-independent); anything else is invalid.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- exported boundary parser: unknown input IS its contract; routes feed it raw request-body fields.
export function parseDueDate(raw: unknown): DueDateParse {
	if (raw === null) return { status: 'ok', value: null };
	// oxlint-disable-next-line anti-slop/no-runtime-typeof -- boundary parser: request JSON arrives untyped; rejecting non-strings here IS the contract.
	if (typeof raw !== 'string') return { status: 'invalid' };
	if (raw.trim() === '') return { status: 'ok', value: null };
	if (!isValidDateString(raw)) return { status: 'invalid' };
	const value = isDateOnlyString(raw) ? `${raw}T00:00:00.000Z` : raw;
	return { status: 'ok', value };
}

/**
 * Bill provenance + draft marker (#033): 'manual' = user-created;
 * 'email' = an unconfirmed ingest draft (never counted as spent, never
 * trains the Tag Table until confirmed — confirming flips it to
 * 'manual'). 'paste'/'scan' are reserved for provenance.
 */
export type BillSource = 'manual' | 'email' | 'scan' | 'paste';

export interface CreateBillInput {
	title: string;
	amountCents: number;
	dueDate: string | null;
	category: BillCategory;
	userId: string;
	familyId: string | null;
	source?: BillSource;
}

export async function createBill(input: CreateBillInput): Promise<Bill> {
	const [row] = await db.insert(bills).values(input).returning();
	return row;
}

export async function getBill(id: string): Promise<Bill | undefined> {
	const [row] = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
	return row;
}

/**
 * Bills visible to a user: their family's bills plus their own personal
 * (family-less) bills. Mirrors getTasksForUser.
 */
export async function getBillsForUser(userId: string, familyId: string | null): Promise<Bill[]> {
	const personal = and(isNull(bills.familyId), eq(bills.userId, userId));
	const conditions = familyId ? or(eq(bills.familyId, familyId), personal) : personal;
	// Postgres ASC defaults to NULLS FIRST; undated bills belong last, with
	// title as a stable tiebreaker for same-day due dates.
	return db
		.select()
		.from(bills)
		.where(conditions)
		.orderBy(sql`${bills.dueDate} asc nulls last`, asc(bills.title));
}

/**
 * Pure permission predicate: the owner, or a family creator/admin, may
 * mutate a bill. Plain members get read-only visibility.
 */
export function canMutateBill(bill: Bill, userId: string, role: string | null): boolean {
	if (bill.userId === userId) return true;
	return role === 'creator' || role === 'admin';
}

export type BillPatch = Partial<
	Pick<Bill, 'title' | 'amountCents' | 'dueDate' | 'category' | 'paidAt' | 'source'>
>;

export async function updateBill(
	id: string,
	userId: string,
	role: string | null,
	patch: BillPatch
): Promise<Bill | null> {
	const existing = await getBill(id);
	if (!existing || !canMutateBill(existing, userId, role)) return null;
	const [row] = await db.update(bills).set(patch).where(eq(bills.id, id)).returning();
	return row ?? null;
}

export async function deleteBill(
	id: string,
	userId: string,
	role: string | null
): Promise<boolean> {
	const existing = await getBill(id);
	if (!existing || !canMutateBill(existing, userId, role)) return false;
	const removed = await db.delete(bills).where(eq(bills.id, id)).returning();
	return removed.length > 0;
}

/* ── Line Items (#031) ────────────────────────────────────────────────
 * A Bill optionally carries Line Items — label, price cents, and its own
 * category Label (null = inherits the Bill's category). Bill total stays
 * authoritative; items are annotations that drive Spend Detail and train
 * the Tag Table. Replace-all semantics per update.
 */

/** A validated line-item input; `name` is the learned SKU display name. */
export interface BillItemInput {
	label: string;
	priceCents: number;
	category: BillCategory | null;
	name: string | null;
}

export const MAX_BILL_ITEMS = 50;

function isNonEmptyBoundedString(raw: unknown, max: number): raw is string {
	return typeof raw === 'string' && raw.trim().length > 0 && raw.trim().length <= max;
}

/** True for a JSON object entry (an item literal from the request body). */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body items arrive as unkeyed JSON objects; every field is validated before use below.
function isItemEntry(raw: unknown): raw is Record<string, unknown> {
	return typeof raw === 'object' && raw !== null;
}

/** True for a usable integer-cents value (number or digits string). */
function isItemCents(raw: unknown): raw is number | string {
	return typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '');
}

/** True when the raw category field is absent or explicit null (inherit). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary predicate over request JSON; "absent or null" IS the contract it checks.
function isInheritCategory(raw: unknown): boolean {
	return raw === undefined || raw === null;
}

/** True when the raw name field is absent or explicit null. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary predicate over request JSON; "absent or null" IS the contract it checks.
function isInheritName(raw: unknown): boolean {
	return raw === undefined || raw === null;
}

/** True when an already-narrowed cents value is the number form. */
function isRawNumber(raw: number | string): raw is number {
	return typeof raw === 'number';
}

/** Integer cents from an int number or int digits string; null otherwise. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- exported boundary parser: unknown input IS its contract; routes feed it raw request-body fields.
function normalizeItemCents(raw: unknown): number | null {
	// SAFETY: boundary parser over request JSON; Number() on a validated
	// non-blank string is the intended coercion, no precision lost.
	const n = isItemCents(raw) ? (isRawNumber(raw) ? raw : Number(raw)) : Number.NaN;
	if (!Number.isInteger(n) || n < 0 || !Number.isSafeInteger(n) || n > 2147483647) return null;
	return n;
}

/**
 * Parses the `items` request field into validated line-item inputs.
 * Labels ≤100 chars, integer cents ≥0, category in the closed vocabulary
 * or null (inherit), optional learned name ≤100 chars, at most 50 items.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- exported boundary parser: unknown input IS its contract; routes feed it raw request-body fields.
export function normalizeBillItems(raw: unknown): { items: BillItemInput[] } | { error: string } {
	if (!Array.isArray(raw)) return { error: 'Line items must be an array' };
	if (raw.length > MAX_BILL_ITEMS) {
		return { error: `At most ${MAX_BILL_ITEMS} line items` };
	}
	const items: BillItemInput[] = [];
	for (const entry of raw) {
		if (!isItemEntry(entry)) {
			return { error: 'Line items must be objects' };
		}
		if (!isNonEmptyBoundedString(entry.label, 100)) {
			return { error: 'Line item labels must be 1–100 characters' };
		}
		const priceCents = normalizeItemCents(entry.priceCents);
		if (priceCents === null) {
			return { error: 'Line item prices must be integer cents ≥ 0' };
		}
		let category: BillCategory | null = null;
		if (!isInheritCategory(entry.category)) {
			if (!isBillCategory(entry.category)) {
				return { error: 'Line item category must be one of the bill categories' };
			}
			category = entry.category;
		}
		let name: string | null = null;
		if (!isInheritName(entry.name)) {
			if (!isNonEmptyBoundedString(entry.name, 100)) {
				return { error: 'Line item names must be 1–100 characters' };
			}
			name = entry.name.trim();
		}
		items.push({ label: entry.label.trim(), priceCents, category, name });
	}
	return { items };
}

/**
 * Replace-all persistence for one bill's line items: one transaction that
 * deletes the existing rows and inserts the new list with positions.
 */
export async function setBillItems(billId: string, items: BillItemInput[]): Promise<ReceiptItem[]> {
	return db.transaction(async (tx) => {
		await tx.delete(receiptItems).where(eq(receiptItems.billId, billId));
		if (items.length === 0) return [];
		const rows = await tx
			.insert(receiptItems)
			.values(
				items.map((item, position) => ({
					billId,
					label: item.label,
					priceCents: item.priceCents,
					category: item.category,
					position
				}))
			)
			.returning();
		return rows;
	});
}

/** All line items for the given bills, grouped by billId, position-ordered. */
export async function getItemsForBills(billIds: string[]): Promise<Map<string, ReceiptItem[]>> {
	const grouped = new Map<string, ReceiptItem[]>();
	if (billIds.length === 0) return grouped;
	const rows = await db
		.select()
		.from(receiptItems)
		.where(inArray(receiptItems.billId, billIds))
		.orderBy(asc(receiptItems.position));
	for (const row of rows) {
		const list = grouped.get(row.billId) ?? [];
		list.push(row);
		grouped.set(row.billId, list);
	}
	return grouped;
}
