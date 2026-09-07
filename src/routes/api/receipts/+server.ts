import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestEvent } from './$types';
import { checkSubscriptionAction } from '$lib/server/services/subscriptionService';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { createAttachment } from '$lib/server/db/actions/attachments';
import { uploadReceiptAsset, type StoredBlob } from '$lib/server/services/blobService';
import { requireUserJson } from '$lib/server/utils/requireUser';

/** Receipt photos: camera/crop formats only; no PDFs or arbitrary files (v1). */
const ALLOWED_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif'
] as const;

/** Mime → filename extension; unknown types were already rejected above. */
function extensionFor(mimeType: string): string {
	const known = ALLOWED_MIME_TYPES.find((type) => type === mimeType) ?? 'image/jpeg';
	return {
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'image/webp': 'webp',
		'image/heic': 'heic',
		'image/heif': 'heif'
	}[known];
}

/**
 * Collaborators the receipts endpoint needs, injectable so tests pass fakes
 * through a real seam instead of mocking modules. Defaults wire production.
 */
export type ReceiptsDeps = {
	checkSubscriptionAction: typeof checkSubscriptionAction;
	getUserFamilyId: typeof getUserFamilyId;
	createAttachment: typeof createAttachment;
	uploadReceiptAsset: typeof uploadReceiptAsset;
};

const defaultDeps: ReceiptsDeps = {
	checkSubscriptionAction,
	getUserFamilyId,
	createAttachment,
	uploadReceiptAsset
};

/** Shape the client needs to reference and render the stored receipt. */
export type ReceiptView = {
	id: string;
	url: string;
	filename: string;
	mimeType: string;
	sizeBytes: number;
};

export const POST = async (event: RequestEvent, deps: ReceiptsDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	let form: FormData;
	try {
		form = await event.request.formData();
	} catch {
		return json({ error: 'Expected multipart form data with a file field' }, { status: 400 });
	}
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) {
		return json({ error: 'A receipt image file is required' }, { status: 400 });
	}
	if (!ALLOWED_MIME_TYPES.some((type) => type === file.type)) {
		return json({ error: 'Receipt must be a JPEG, PNG, WebP, or HEIC image' }, { status: 415 });
	}

	const familyId = await deps.getUserFamilyId(auth.user.id);
	const check = await deps.checkSubscriptionAction('uploadAttachment', {
		userId: auth.user.id,
		fileSizeBytes: file.size
	});
	if (!check.canUploadAttachment) {
		// Plan message names the limit; 413 tells the client it's a size cap.
		return json({ error: check.reason ?? 'File too large for your plan' }, { status: 413 });
	}

	try {
		const content = Buffer.from(await file.arrayBuffer());
		const ext = extensionFor(file.type);
		const filename = `${auth.user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
		const stored: StoredBlob = await deps.uploadReceiptAsset({
			filename,
			content,
			contentType: file.type
		});
		const attachment = await deps.createAttachment({
			ownerUserId: auth.user.id,
			familyId,
			url: stored.url,
			filename: stored.pathname,
			mimeType: file.type,
			sizeBytes: file.size
		});
		const view: ReceiptView = {
			id: attachment.id,
			url: attachment.url,
			filename: attachment.filename,
			mimeType: attachment.mimeType,
			sizeBytes: attachment.sizeBytes
		};
		return json({ success: true, attachment: view }, { status: 201 });
	} catch (error) {
		console.error('Failed to store receipt:', error);
		return apiError(event.request.url, 500, 'Failed to store receipt', auth.user.id);
	}
};
