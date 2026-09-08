import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestEvent } from './$types';
import { getBillsForUser } from '$lib/server/db/actions/bills';
import {
	applyBillSave,
	BillSaveValidationError,
	defaultBillSaveDeps,
	type BillSaveDeps
} from '$lib/server/services/billSave';
import { requireUserJson } from '$lib/server/utils/requireUser';

/**
 * Collaborators the bills endpoints need, injectable so tests pass fakes
 * through a real seam instead of mocking modules. The save choreography
 * (validation, create, items replace-all, training gate, cursor advance)
 * lives in applyBillSave — this route only adds auth + JSON mapping.
 */
export type BillsDeps = BillSaveDeps & { getBillsForUser: typeof getBillsForUser };

const defaultDeps: BillsDeps = { ...defaultBillSaveDeps, getBillsForUser };

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
	try {
		const saved = await applyBillSave(deps, { userId: auth.user.id }, { billId: null, body });
		return saved.items
			? json(
					{
						success: true,
						bill: saved.bill,
						items: saved.items,
						itemsSum: saved.itemsSum,
						unlabeled: saved.unlabeled
					},
					{ status: 201 }
				)
			: json({ success: true, bill: saved.bill }, { status: 201 });
	} catch (error) {
		if (error instanceof BillSaveValidationError) {
			return json({ error: error.message }, { status: 400 });
		}
		console.error('Failed to create bill:', error);
		return apiError(event.request.url, 500, 'Failed to create bill', auth.user.id);
	}
};
