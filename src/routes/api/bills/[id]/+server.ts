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
	type BillPatch
} from '$lib/server/db/actions/bills';
import { getFamilyMemberRole } from '$lib/server/db/actions/families';
import { requireUserJson } from '$lib/server/utils/requireUser';

/**
 * Collaborators the bill endpoints need, injectable so tests pass fakes
 * through a real seam instead of mocking modules. Defaults wire production.
 */
export type BillIdDeps = {
	getBill: typeof getBill;
	getFamilyMemberRole: typeof getFamilyMemberRole;
	updateBill: typeof updateBill;
	deleteBill: typeof deleteBill;
};

const defaultDeps: BillIdDeps = {
	getBill,
	getFamilyMemberRole,
	updateBill,
	deleteBill
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
		return json({ error: 'No permission to change this bill' }, { status: 403 });
	}
	return { bill, role };
}

export const PUT = async (event: RequestEvent, deps: BillIdDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const allowed = await authorize(event, deps, auth.user.id);
	if (allowed instanceof Response) return allowed;

	const body = await event.request.json();
	const patch: BillPatch = {};
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
	if (body.dueDate !== undefined)
		patch.dueDate = isNonEmptyString(body.dueDate) ? body.dueDate : null;
	if (body.category !== undefined) patch.category = normalizeBillCategory(body.category);
	if (body.paid !== undefined) patch.paidAt = body.paid ? new Date().toISOString() : null;
	if (body.familyId !== undefined)
		patch.familyId = isNonEmptyString(body.familyId) ? body.familyId : null;

	try {
		const updated = await deps.updateBill(event.params.id, auth.user.id, allowed.role, patch);
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
