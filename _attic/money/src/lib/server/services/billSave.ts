import {
	advanceBillCursor,
	canMutateBill,
	createBill,
	getBill,
	getItemsForBills,
	normalizeAmountCents,
	normalizeBillCategory,
	normalizeBillItems,
	parseDueDate,
	parseRecurrence,
	setBillItems,
	updateBill,
	type BillFrequency,
	type BillItemInput,
	type BillPatch,
	type CreateBillInput
} from '$lib/server/db/actions/bills';
import { getFamilyMemberRole, getUserFamilyId } from '$lib/server/db/actions/families';
import { trainTagTable, type TagTableEntry } from '$lib/server/services/tagTable';
import type { Bill, BillCategory, ReceiptItem } from '$lib/server/db/schema';

/**
 * applyBillSave (#031/#033/#006) — the one deep module behind "save a
 * Bill". Both bill write endpoints (POST /api/bills, PUT /api/bills/[id])
 * delegate here; the module owns the full choreography so the routes stay
 * auth + JSON mapping:
 *
 *  1. Body validation via the boundary parsers in actions/bills (thrown
 *     as BillSaveValidationError BEFORE anything is written).
 *  2. Create (billId null) or update (PUT semantics: field patch).
 *  3. Line items replace-all via setBillItems.
 *  4. Soft reconcile summary (itemsSum + unlabeled count).
 *  5. Tag Table training gate: source !== 'manual' → never train;
 *     confirmed drafts flip to 'manual' (confirmDraft) and then train;
 *     'other' still trains (popularity data).
 *  6. Cursor advance on paid=true for a recurring bill
 *     (advanceBillCursor); unmark/one-off never touch the cursor.
 *
 * The returned events/descriptor (advancedTo, trained) lets callers craft
 * toasts without re-deriving what happened.
 */

/** Repo-level collaborators the save choreography needs; injectable so
 * tests pass fakes through a real seam. Defaults wire production. */
export type BillSaveDeps = {
	getUserFamilyId: typeof getUserFamilyId;
	getBill: typeof getBill;
	getFamilyMemberRole: typeof getFamilyMemberRole;
	createBill: typeof createBill;
	updateBill: typeof updateBill;
	setBillItems: typeof setBillItems;
	getItemsForBills: typeof getItemsForBills;
	trainTagTable: typeof trainTagTable;
	advanceBillCursor: typeof advanceBillCursor;
};

export const defaultBillSaveDeps: BillSaveDeps = {
	getUserFamilyId,
	getBill,
	getFamilyMemberRole,
	createBill,
	updateBill,
	setBillItems,
	getItemsForBills,
	trainTagTable,
	advanceBillCursor
};

/** Body failed validation — nothing was (or will be) persisted. */
export class BillSaveValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BillSaveValidationError';
	}
}

/** Bill missing or not mutable by the caller — same body as not-found so
 * existence is never confirmed to non-members. */
export class BillSaveNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BillSaveNotFoundError';
	}
}

/** Soft reconcile summary: items sum + how many items inherit the bill category. */
interface ReconcileSummary {
	itemsSum: number;
	unlabeled: number;
}

function reconcileSummary(items: BillItemInput[]): ReconcileSummary {
	return {
		itemsSum: items.reduce((sum, item) => sum + item.priceCents, 0),
		unlabeled: items.filter((item) => item.category === null).length
	};
}

/**
 * Tag Table training entries for a bill's line items: the merchant key is
 * the bill title (trainTagTable normalizes it), each item's key is its
 * label; items without their own category inherit the bill's.
 */
function trainEntries(bill: Bill, items: BillItemInput[]): TagTableEntry[] {
	// SAFETY: bills.category is a BILL_CATEGORIES literal (validated by
	// normalizeBillCategory at write); the DB text column widens it to
	// string on read, so the assertion only restores the write-side type.
	const category = bill.category as BillCategory;
	return items.map((item) => ({
		key: item.label,
		category: item.category ?? category,
		name: item.name
	}));
}

/** Training gate (#031/#033): only a manual bill trains; 'other' counts. */
async function maybeTrain(
	train: typeof trainTagTable,
	userId: string,
	bill: Bill,
	items: BillItemInput[]
): Promise<boolean> {
	if ((bill.source ?? 'manual') !== 'manual') return false;
	// SAFETY: bills.category is a BILL_CATEGORIES literal, written only via
	// normalizeBillCategory; the text column widens it back to string — the
	// assertion restores the write-side vocabulary type.
	// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- DB widening cast, justified above.
	const category = bill.category as BillCategory;
	await train(userId, bill.title, category, trainEntries(bill, items));
	return true;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

/** Parses the `items` request field; absent = null, invalid = throw BEFORE
 * anything is written (items are replace-all annotations, #031). */
function parseItemsField(
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body bag: every field is read through the boundary parsers below.
	body: Record<string, unknown>
): BillItemInput[] | null {
	if (body.items === undefined) return null;
	const parsed = normalizeBillItems(body.items);
	if ('error' in parsed) throw new BillSaveValidationError(parsed.error);
	return parsed.items;
}

function parseDueDateField(
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body bag: every field is read through the boundary parsers below.
	body: Record<string, unknown>
): string | null {
	if (body.dueDate === undefined) return null;
	const parsed = parseDueDate(body.dueDate);
	if (parsed.status === 'invalid') {
		throw new BillSaveValidationError('Due date must be a valid date');
	}
	return parsed.value;
}

/** Recurring schedule (#006): null clears both fields; absent = untouched
 * for updates, one-off for creates. Returns null when absent. */
function parseRecurrenceField(
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body bag: every field is read through the boundary parsers below.
	body: Record<string, unknown>
): { frequency: BillFrequency | null; interval: number | null } | null {
	if (body.recurring === undefined) return null;
	const parsed = parseRecurrence(body.recurring);
	if (parsed.status === 'invalid') {
		throw new BillSaveValidationError(
			'Recurring needs a frequency (daily/weekly/monthly/yearly) and interval 1–365'
		);
	}
	return { frequency: parsed.value?.frequency ?? null, interval: parsed.value?.interval ?? null };
}

/** What happened, for toast/response crafting without re-derivation. */
export interface BillSaveEvents {
	/** New cursor dueDate when paid=true advanced a recurring bill; else null. */
	advancedTo: string | null;
	/** Whether the Tag Table was trained on this save. */
	trained: boolean;
}

export interface BillSaveResult {
	bill: Bill;
	/** Stored items after a replace-all save; null when `items` was absent. */
	items: ReceiptItem[] | null;
	itemsSum: number | null;
	unlabeled: number | null;
	events: BillSaveEvents;
}

const IDLE_EVENTS: BillSaveEvents = { advancedTo: null, trained: false };

async function createBillSave(
	deps: BillSaveDeps,
	userId: string,
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body bag: every field is read through the boundary parsers above.
	body: Record<string, unknown>
): Promise<BillSaveResult> {
	if (!isNonEmptyString(body.title)) {
		throw new BillSaveValidationError('Title is required');
	}
	const title = body.title;
	const amountCents = normalizeAmountCents(body.amount);
	if (amountCents === null) {
		throw new BillSaveValidationError('Amount must be a non-negative number');
	}
	const items = parseItemsField(body);
	const dueDate = parseDueDateField(body);
	const recurrence = parseRecurrenceField(body);
	const familyId = await deps.getUserFamilyId(userId);
	const input: CreateBillInput = {
		title: title.trim(),
		amountCents,
		dueDate,
		category: normalizeBillCategory(body.category),
		userId,
		familyId,
		frequency: recurrence?.frequency ?? null,
		interval: recurrence?.interval ?? null
	};
	const created = await deps.createBill(input);
	if (!items)
		return { bill: created, items: null, itemsSum: null, unlabeled: null, events: IDLE_EVENTS };
	const stored = await deps.setBillItems(created.id, items);
	const trained = await maybeTrain(deps.trainTagTable, userId, created, items);
	return {
		bill: created,
		items: stored,
		...reconcileSummary(items),
		events: { advancedTo: null, trained }
	};
}

async function updateBillSave(
	deps: BillSaveDeps,
	userId: string,
	billId: string,
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body bag: every field is read through the boundary parsers above.
	body: Record<string, unknown>
): Promise<BillSaveResult> {
	const existing = await deps.getBill(billId);
	if (!existing) throw new BillSaveNotFoundError('Bill not found');
	const role = await deps.getFamilyMemberRole(userId, existing.familyId ?? '');
	if (!canMutateBill(existing, userId, role)) {
		// Same body as not-found: don't confirm bill existence to non-members.
		throw new BillSaveNotFoundError('Bill not found');
	}

	const patch: BillPatch = {};
	// Line items (#031): validated BEFORE anything is written; replace-all
	// semantics. Absent `items` leaves the stored list untouched.
	const items = parseItemsField(body);
	if (body.title !== undefined) {
		if (!isNonEmptyString(body.title)) {
			throw new BillSaveValidationError('Title must not be empty');
		}
		patch.title = body.title.trim();
	}
	if (body.amount !== undefined) {
		const amountCents = normalizeAmountCents(body.amount);
		if (amountCents === null) {
			throw new BillSaveValidationError('Amount must be a non-negative number');
		}
		patch.amountCents = amountCents;
	}
	const dueDate = parseDueDateField(body);
	if (body.dueDate !== undefined) patch.dueDate = dueDate;
	if (body.category !== undefined) patch.category = normalizeBillCategory(body.category);
	if (body.paid !== undefined) patch.paidAt = body.paid ? new Date().toISOString() : null;
	const recurrence = parseRecurrenceField(body);
	if (body.recurring !== undefined) {
		patch.frequency = recurrence?.frequency ?? null;
		patch.interval = recurrence?.interval ?? null;
	}

	// Draft confirmation (#033): an email-ingest draft (source !== 'manual')
	// becomes a real bill when the user confirms it — flipping the source
	// back to 'manual' is what enables Tag Table training below. A manual
	// bill's confirmDraft is a no-op.
	const wasDraft = (existing.source ?? 'manual') !== 'manual';
	const confirming = body.confirmDraft === true && wasDraft;
	if (confirming) patch.source = 'manual';

	if (Object.keys(patch).length === 0 && items === null) {
		// Empty patch and no items: drizzle's set({}) throws, and there is
		// nothing to write.
		return { bill: existing, items: null, itemsSum: null, unlabeled: null, events: IDLE_EVENTS };
	}

	// An items-only save has an empty field patch — skip the bill update
	// (drizzle's set({}) throws) and work from the existing bill.
	const updated =
		Object.keys(patch).length > 0 ? await deps.updateBill(billId, userId, role, patch) : null;
	let bill = updated ?? existing;

	// PAID on a recurring bill (#006): roll the dueDate cursor forward from
	// the OLD dueDate. Unmark-paid does NOT rewind the cursor (documented
	// asymmetry); one-off bills are untouched.
	const paidAtIso = patch.paidAt ?? null;
	let advancedTo: string | null = null;
	if (body.paid === true && existing.frequency && updated && paidAtIso) {
		const advanced = await deps.advanceBillCursor(billId, paidAtIso);
		if (advanced) {
			bill = advanced;
			advancedTo = advanced.dueDate;
		}
	}

	// Training gate (#033): train ONLY when the bill is (now) manual — an
	// unconfirmed email draft never trains, even when items are saved.
	const trains = (bill.source ?? 'manual') === 'manual';
	if (items) {
		// Replace-all + training against the bill's CURRENT title/category
		// (the same request may have changed them).
		const stored = await deps.setBillItems(bill.id, items);
		const trained = trains ? await maybeTrain(deps.trainTagTable, userId, bill, items) : false;
		return { bill, items: stored, ...reconcileSummary(items), events: { advancedTo, trained } };
	}
	if (confirming) {
		// Confirm-only confirm: train from the draft's stored items.
		const stored = (await deps.getItemsForBills([bill.id])).get(bill.id) ?? [];
		const storedInputs: BillItemInput[] = stored.map((item) => ({
			label: item.label,
			priceCents: item.priceCents,
			// SAFETY: receiptItems.category is a BILL_CATEGORIES literal
			// written only via normalizeBillItems; the text column widens
			// it back to string on read — this restores the write type.
			// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- DB widening cast, justified above.
			category: (item.category as BillCategory | null) ?? null,
			// Stored items carry no learned SKU name (name lives in the
			// BillItemInput for the save request, not the receiptItems row).
			name: null
		}));
		const trained = await maybeTrain(deps.trainTagTable, userId, bill, storedInputs);
		return { bill, items: null, itemsSum: null, unlabeled: null, events: { advancedTo, trained } };
	}
	if (!updated) throw new BillSaveNotFoundError('Bill not found');
	return {
		bill,
		items: null,
		itemsSum: null,
		unlabeled: null,
		events: { advancedTo, trained: false }
	};
}

/**
 * Saves a bill: create when billId is null, update otherwise. Throws
 * BillSaveValidationError (before anything persists) or
 * BillSaveNotFoundError; unexpected repo errors propagate to the caller.
 */
export async function applyBillSave(
	deps: BillSaveDeps,
	caller: { userId: string },
	input: { billId: string | null; body: unknown }
): Promise<BillSaveResult> {
	// SAFETY: body arrives as untyped request JSON; every field is read
	// through the boundary parsers/validators above before use.
	// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type,anti-slop/require-safety-comment-for-type-assertion -- untyped request-JSON bag; parsers validate every field.
	const body = input.body as Record<string, unknown>;
	return input.billId === null
		? createBillSave(deps, caller.userId, body)
		: updateBillSave(deps, caller.userId, input.billId, body);
}
