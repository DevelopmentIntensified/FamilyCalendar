import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bills, BILL_CATEGORIES, type Bill, type BillCategory } from '$lib/server/db/schema';

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

export interface CreateBillInput {
	title: string;
	amountCents: number;
	dueDate: string | null;
	category: BillCategory;
	userId: string;
	familyId: string | null;
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
	Pick<Bill, 'title' | 'amountCents' | 'dueDate' | 'category' | 'paidAt'>
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
