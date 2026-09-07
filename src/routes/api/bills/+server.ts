import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestEvent } from './$types';
import {
	createBill,
	getBillsForUser,
	normalizeAmountCents,
	normalizeBillCategory,
	parseDueDate,
	type CreateBillInput
} from '$lib/server/db/actions/bills';
import { getAttachment } from '$lib/server/db/actions/attachments';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { resolveAttachmentId } from '$lib/server/utils/resolveAttachment';
import { buildReceiptsByBillId, getAttachmentsByIds } from '$lib/server/db/actions/attachments';

/**
 * Collaborators the bills endpoints need, injectable so tests pass fakes
 * through a real seam instead of mocking modules. Defaults wire production.
 */
export type BillsDeps = {
	getUserFamilyId: typeof getUserFamilyId;
	getBillsForUser: typeof getBillsForUser;
	createBill: typeof createBill;
	getAttachment: typeof getAttachment;
	getAttachmentsByIds: typeof getAttachmentsByIds;
};

const defaultDeps: BillsDeps = {
	getUserFamilyId,
	getBillsForUser,
	createBill,
	getAttachment,
	getAttachmentsByIds
};

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

export const GET = async (event: RequestEvent, deps: BillsDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const familyId = await deps.getUserFamilyId(auth.user.id);
	const bills = await deps.getBillsForUser(auth.user.id, familyId);
	const attachments = await deps.getAttachmentsByIds(
		bills.map((bill) => bill.attachmentId).filter((id): id is string => id !== null)
	);
	return json({ bills, receiptsByBillId: buildReceiptsByBillId(bills, attachments) });
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
		let dueDate: string | null = null;
		if (body.dueDate !== undefined) {
			const parsed = parseDueDate(body.dueDate);
			if (parsed.status === 'invalid') {
				return json({ error: 'Due date must be a valid date' }, { status: 400 });
			}
			dueDate = parsed.value;
		}
		const familyId = await deps.getUserFamilyId(auth.user.id);
		const resolved = await resolveAttachmentId(
			body.attachmentId,
			auth.user.id,
			familyId,
			deps.getAttachment
		);
		if ('error' in resolved) return resolved.error;
		const input: CreateBillInput = {
			title: body.title.trim(),
			amountCents,
			dueDate,
			category: normalizeBillCategory(body.category),
			userId: auth.user.id,
			familyId,
			attachmentId: resolved.id
		};
		const created = await deps.createBill(input);
		return json({ success: true, bill: created }, { status: 201 });
	} catch (error) {
		console.error('Failed to create bill:', error);
		return apiError(event.request.url, 500, 'Failed to create bill', auth.user.id);
	}
};
