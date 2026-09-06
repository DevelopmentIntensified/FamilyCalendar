import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestEvent } from './$types';
import {
	createBill,
	getBillsForUser,
	normalizeAmountCents,
	normalizeBillCategory,
	type CreateBillInput
} from '$lib/server/db/actions/bills';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { requireUserJson } from '$lib/server/utils/requireUser';

/**
 * Collaborators the bills endpoints need, injectable so tests pass fakes
 * through a real seam instead of mocking modules. Defaults wire production.
 */
export type BillsDeps = {
	getUserFamilyId: typeof getUserFamilyId;
	getBillsForUser: typeof getBillsForUser;
	createBill: typeof createBill;
};

const defaultDeps: BillsDeps = {
	getUserFamilyId,
	getBillsForUser,
	createBill
};

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

export const GET = async (event: RequestEvent, deps: BillsDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const familyId = await deps.getUserFamilyId(auth.user.id);
	return json({ bills: await deps.getBillsForUser(auth.user.id, familyId) });
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

	try {
		const familyId = await deps.getUserFamilyId(auth.user.id);
		const input: CreateBillInput = {
			title: body.title.trim(),
			amountCents,
			dueDate: isNonEmptyString(body.dueDate) ? body.dueDate : null,
			category: normalizeBillCategory(body.category),
			userId: auth.user.id,
			familyId
		};
		const created = await deps.createBill(input);
		return json({ success: true, bill: created }, { status: 201 });
	} catch (error) {
		console.error('Failed to create bill:', error);
		return apiError(event.request.url, 500, 'Failed to create bill', auth.user.id);
	}
};
