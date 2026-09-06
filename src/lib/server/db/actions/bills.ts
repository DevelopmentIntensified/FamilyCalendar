import { and, asc, eq, isNull, or } from 'drizzle-orm';
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
	const n = isAmountNumber(raw) ? raw : isAmountString(raw) ? Number(raw) : Number.NaN;
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.round(n * 100);
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
	return db.select().from(bills).where(conditions).orderBy(asc(bills.dueDate));
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
	Pick<Bill, 'title' | 'amountCents' | 'dueDate' | 'category' | 'paidAt' | 'familyId'>
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
