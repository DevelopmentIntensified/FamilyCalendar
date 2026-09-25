import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestEvent } from './$types';
import { deleteBill, getBill, canMutateBill } from '$lib/server/db/actions/bills';
import {
	applyBillSave,
	BillSaveNotFoundError,
	BillSaveValidationError,
	defaultBillSaveDeps,
	type BillSaveDeps
} from '$lib/server/services/billSave';
import { requireUserJson } from '$lib/server/utils/requireUser';

/**
 * Collaborators the bill endpoints need, injectable so tests pass fakes
 * through a real seam instead of mocking modules. The save choreography
 * (validation, patch, items replace-all, training gate, cursor advance)
 * lives in applyBillSave — this route only adds auth + JSON mapping;
 * delete keeps its repo deps here.
 */
export type BillIdDeps = BillSaveDeps & { deleteBill: typeof deleteBill };

const defaultDeps: BillIdDeps = { ...defaultBillSaveDeps, deleteBill };

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

export const PUT = async (event: RequestEvent, deps: BillIdDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const body = await event.request.json();
	try {
		const saved = await applyBillSave(
			deps,
			{ userId: auth.user.id },
			{ billId: event.params.id, body }
		);
		return saved.items
			? json({
					success: true,
					bill: saved.bill,
					items: saved.items,
					itemsSum: saved.itemsSum,
					unlabeled: saved.unlabeled
				})
			: json({ success: true, bill: saved.bill });
	} catch (error) {
		if (error instanceof BillSaveValidationError) {
			return json({ error: error.message }, { status: 400 });
		}
		if (error instanceof BillSaveNotFoundError) {
			return json({ error: error.message }, { status: 404 });
		}
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
