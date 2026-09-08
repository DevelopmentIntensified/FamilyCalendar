import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestEvent } from './$types';
import {
	createBill,
	getBillsForUser,
	normalizeAmountCents,
	normalizeBillCategory,
	normalizeBillItems,
	parseDueDate,
	parseRecurrence,
	setBillItems,
	type BillItemInput,
	type BillFrequency,
	type CreateBillInput
} from '$lib/server/db/actions/bills';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { trainTagTable } from '$lib/server/services/tagTable';
import type { Bill, BillCategory } from '$lib/server/db/schema';

/**
 * Collaborators the bills endpoints need, injectable so tests pass fakes
 * through a real seam instead of mocking modules. Defaults wire production.
 */
export type BillsDeps = {
	getUserFamilyId: typeof getUserFamilyId;
	getBillsForUser: typeof getBillsForUser;
	createBill: typeof createBill;
	setBillItems: typeof setBillItems;
	trainTagTable: typeof trainTagTable;
};

const defaultDeps: BillsDeps = {
	getUserFamilyId,
	getBillsForUser,
	createBill,
	setBillItems,
	trainTagTable
};

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
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

export const GET = async (event: RequestEvent, deps: BillsDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const familyId = await deps.getUserFamilyId(auth.user.id);
	const bills = await deps.getBillsForUser(auth.user.id, familyId);
	return json({ bills });
};

export const POST = async (event: RequestEvent, deps: BillsDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const body = await event.request.json();
	if (!isNonEmptyString(body.title)) {
		return json({ error: 'Title is required' }, { status: 400 });
	}
	const amountCents = normalizeAmountCents(body.amount);
	if (amountCents === null) {
		return json({ error: 'Amount must be a non-negative number' }, { status: 400 });
	}
	// Line items (#031) are validated BEFORE anything is written — the bill
	// total stays authoritative, items are replace-all annotations.
	let items: BillItemInput[] | null = null;
	if (body.items !== undefined) {
		const parsed = normalizeBillItems(body.items);
		if ('error' in parsed) return json({ error: parsed.error }, { status: 400 });
		items = parsed.items;
	}

	try {
		let dueDate: string | null = null;
		if (body.dueDate !== undefined) {
			const parsed = parseDueDate(body.dueDate);
			if (parsed.status === 'invalid') {
				return json({ error: 'Due date must be a valid date' }, { status: 400 });
			}
			dueDate = parsed.value;
		}
		// Recurring schedule (#006): validated before anything is written;
		// null/absent = one-off.
		let frequency: BillFrequency | null = null;
		let interval: number | null = null;
		if (body.recurring !== undefined) {
			const parsed = parseRecurrence(body.recurring);
			if (parsed.status === 'invalid') {
				return json(
					{ error: 'Recurring needs a frequency (daily/weekly/monthly/yearly) and interval 1–365' },
					{ status: 400 }
				);
			}
			frequency = parsed.value?.frequency ?? null;
			interval = parsed.value?.interval ?? null;
		}
		const familyId = await deps.getUserFamilyId(auth.user.id);
		const input: CreateBillInput = {
			title: body.title.trim(),
			amountCents,
			dueDate,
			category: normalizeBillCategory(body.category),
			userId: auth.user.id,
			familyId,
			frequency,
			interval
		};
		const created = await deps.createBill(input);
		if (items) {
			const stored = await deps.setBillItems(created.id, items);
			await trainFromItems(deps.trainTagTable, auth.user.id, created, items);
			return json(
				{ success: true, bill: created, items: stored, ...reconcileSummary(items) },
				{ status: 201 }
			);
		}
		return json({ success: true, bill: created }, { status: 201 });
	} catch (error) {
		console.error('Failed to create bill:', error);
		return apiError(event.request.url, 500, 'Failed to create bill', auth.user.id);
	}
};
