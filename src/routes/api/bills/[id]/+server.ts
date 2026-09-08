import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestEvent } from './$types';
import {
	getBill,
	updateBill,
	deleteBill,
	canMutateBill,
	normalizeAmountCents,
	normalizeBillCategory,
	normalizeBillItems,
	parseDueDate,
	setBillItems,
	type BillItemInput,
	type BillPatch
} from '$lib/server/db/actions/bills';
import { getFamilyMemberRole } from '$lib/server/db/actions/families';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { trainTagTable } from '$lib/server/services/tagTable';
import type { Bill, BillCategory } from '$lib/server/db/schema';

/**
 * Collaborators the bill endpoints need, injectable so tests pass fakes
 * through a real seam instead of mocking modules. Defaults wire production.
 */
export type BillIdDeps = {
	getBill: typeof getBill;
	getFamilyMemberRole: typeof getFamilyMemberRole;
	updateBill: typeof updateBill;
	deleteBill: typeof deleteBill;
	setBillItems: typeof setBillItems;
	trainTagTable: typeof trainTagTable;
};

const defaultDeps: BillIdDeps = {
	getBill,
	getFamilyMemberRole,
	updateBill,
	deleteBill,
	setBillItems,
	trainTagTable
};

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

async function authorize(
	event: RequestEvent,
	deps: BillIdDeps,
	userId: string
): Promise<
	{ bill: NonNullable<Awaited<ReturnType<typeof getBill>>>; role: string | null } | Response
> {
	const bill = await deps.getBill(event.params.id);
	if (!bill) return json({ error: 'Bill not found' }, { status: 404 });
	const role = await deps.getFamilyMemberRole(userId, bill.familyId ?? '');
	if (!canMutateBill(bill, userId, role)) {
		// Same body as not-found: don't confirm bill existence to non-members.
		return json({ error: 'Bill not found' }, { status: 404 });
	}
	return { bill, role };
}

/**
 * Learning loop (#031): every save with line items upserts the Tag Table —
 * the merchant key (bill-title derived) + each item's label-derived key.
 * 'other' still trains; it builds popularity data for dev curation.
 */
async function trainFromItems(
	train: typeof trainTagTable,
	userId: string,
	bill: Bill,
	items: BillItemInput[]
): Promise<void> {
	// SAFETY: bills.category is a BILL_CATEGORIES literal (validated by
	// normalizeBillCategory at write); the DB text column widens it to
	// string on read, so the assertion only restores the write-side type.
	const category = bill.category as BillCategory;
	await train(
		userId,
		bill.title,
		category,
		items.map((item) => ({
			key: item.label,
			category: item.category ?? category,
			name: item.name
		}))
	);
}

/** Soft reconcile summary: items sum + how many items inherit the bill category. */
interface ReconcileSummary {
	itemsSum: number;
	unlabeled: number;
}

/** Soft reconcile summary: items sum + how many items inherit the bill category. */
function reconcileSummary(items: BillItemInput[]): ReconcileSummary {
	return {
		itemsSum: items.reduce((sum, item) => sum + item.priceCents, 0),
		unlabeled: items.filter((item) => item.category === null).length
	};
}

export const PUT = async (event: RequestEvent, deps: BillIdDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const allowed = await authorize(event, deps, auth.user.id);
	if (allowed instanceof Response) return allowed;

	const body = await event.request.json();
	const patch: BillPatch = {};
	// Line items (#031): validated BEFORE anything is written; replace-all
	// semantics. Absent `items` leaves the stored list untouched.
	let items: BillItemInput[] | null = null;
	if (body.items !== undefined) {
		const parsed = normalizeBillItems(body.items);
		if ('error' in parsed) return json({ error: parsed.error }, { status: 400 });
		items = parsed.items;
	}
	if (body.title !== undefined) {
		if (!isNonEmptyString(body.title)) {
			return json({ error: 'Title must not be empty' }, { status: 400 });
		}
		patch.title = body.title.trim();
	}
	if (body.amount !== undefined) {
		const amountCents = normalizeAmountCents(body.amount);
		if (amountCents === null) {
			return json({ error: 'Amount must be a non-negative number' }, { status: 400 });
		}
		patch.amountCents = amountCents;
	}
	if (body.dueDate !== undefined) {
		const parsed = parseDueDate(body.dueDate);
		if (parsed.status === 'invalid') {
			return json({ error: 'Due date must be a valid date' }, { status: 400 });
		}
		patch.dueDate = parsed.value;
	}
	if (body.category !== undefined) patch.category = normalizeBillCategory(body.category);
	if (body.paid !== undefined) patch.paidAt = body.paid ? new Date().toISOString() : null;

	if (Object.keys(patch).length === 0 && items === null) {
		// Empty patch and no items: drizzle's set({}) throws, and there is
		// nothing to write.
		return json({ success: true, bill: allowed.bill });
	}

	try {
		// An items-only save has an empty field patch — skip the bill update
		// (drizzle's set({}) throws) and work from the existing bill.
		const updated =
			Object.keys(patch).length > 0
				? await deps.updateBill(event.params.id, auth.user.id, allowed.role, patch)
				: null;
		const bill = updated ?? allowed.bill;
		if (items) {
			// Replace-all + training against the bill's CURRENT title/category
			// (the same request may have changed them).
			const stored = await deps.setBillItems(bill.id, items);
			await trainFromItems(deps.trainTagTable, auth.user.id, bill, items);
			return json({ success: true, bill, items: stored, ...reconcileSummary(items) });
		}
		if (!updated) return json({ error: 'Bill not found' }, { status: 404 });
		return json({ success: true, bill: updated });
	} catch (error) {
		console.error('Failed to update bill:', error);
		return apiError(event.request.url, 500, 'Failed to update bill', auth.user.id);
	}
};

export const DELETE = async (event: RequestEvent, deps: BillIdDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const allowed = await authorize(event, deps, auth.user.id);
	if (allowed instanceof Response) return allowed;

	try {
		const removed = await deps.deleteBill(event.params.id, auth.user.id, allowed.role);
		if (!removed) return json({ error: 'Bill not found' }, { status: 404 });
		return json({ success: true });
	} catch (error) {
		console.error('Failed to delete bill:', error);
		return apiError(event.request.url, 500, 'Failed to delete bill', auth.user.id);
	}
};
