import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestEvent } from './$types';
import {
	canManageAttachment,
	deleteAttachment,
	getAttachment
} from '$lib/server/db/actions/attachments';
import { getFamilyMemberRole } from '$lib/server/db/actions/families';
import { deleteReceiptAsset } from '$lib/server/services/blobService';
import { requireUserJson } from '$lib/server/utils/requireUser';

/**
 * Collaborators the receipt-delete endpoint needs, injectable so tests pass
 * fakes through a real seam instead of mocking modules. Defaults wire prod.
 */
export type ReceiptIdDeps = {
	getAttachment: typeof getAttachment;
	getFamilyMemberRole: typeof getFamilyMemberRole;
	deleteAttachment: typeof deleteAttachment;
	deleteReceiptAsset: typeof deleteReceiptAsset;
};

const defaultDeps: ReceiptIdDeps = {
	getAttachment,
	getFamilyMemberRole,
	deleteAttachment,
	deleteReceiptAsset
};

/**
 * DELETE: owner or family admin only. Detaches bills + deletes the row in
 * one transaction, then best-effort removes the blob (a leftover blob with
 * no row is harmless; a dead row would not be).
 */
export const DELETE = async (event: RequestEvent, deps: ReceiptIdDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const attachment = await deps.getAttachment(event.params.id);
	if (!attachment) return json({ error: 'Receipt not found' }, { status: 404 });

	const role = attachment.familyId
		? await deps.getFamilyMemberRole(auth.user.id, attachment.familyId)
		: null;
	if (!canManageAttachment(attachment, auth.user.id, role)) {
		// Same body as not-found: don't confirm existence to non-owners.
		return json({ error: 'Receipt not found' }, { status: 404 });
	}

	try {
		const removed = await deps.deleteAttachment(attachment.id);
		if (!removed) return json({ error: 'Receipt not found' }, { status: 404 });
		try {
			await deps.deleteReceiptAsset(attachment.url);
		} catch (blobError) {
			// Row is gone; an orphaned blob only costs storage. Logged, not fatal.
			console.error('Failed to delete receipt blob:', blobError);
		}
		return json({ success: true });
	} catch (error) {
		console.error('Failed to delete receipt:', error);
		return apiError(event.request.url, 500, 'Failed to delete receipt', auth.user.id);
	}
};
