import { describe, it, expect, vi } from 'vitest';
import { POST, type ReceiptsDeps } from './+server';
import type { CreateAttachmentInput } from '$lib/server/db/actions/attachments';

function deps(over: Partial<ReceiptsDeps> = {}): ReceiptsDeps {
	return {
		checkSubscriptionAction: async () => ({
			canAddFamily: true,
			canViewArchive: true,
			canUploadAttachment: true
		}),
		getUserFamilyId: async () => 'f1',
		createAttachment: async (input) => ({
			id: 'att-1',
			createdAt: new Date(),
			...input
		}),
		uploadReceiptAsset: async ({ filename }) => ({
			url: `https://blob.example/family-master/receipts/${filename}`,
			pathname: `family-master/receipts/${filename}`
		}),
		...over
	};
}

function file(parts: { type?: string; size?: number; name?: string } = {}): File {
	const bytes = new Uint8Array(parts.size ?? 4);
	// SAFETY: test double — the handler only reads name/type/size/arrayBuffer.
	return new File([bytes], parts.name ?? 'receipt.jpg', { type: parts.type ?? 'image/jpeg' });
}

function event(userId: string | null, form: FormData, fail = false): never {
	// SAFETY: test double — handlers only read locals.user, url, and request.formData().
	return {
		locals: { user: userId ? { id: userId } : null },
		url: new URL('http://localhost/api/receipts'),
		request: {
			url: 'http://localhost/api/receipts',
			formData: fail ? () => Promise.reject(new Error('bad form')) : () => Promise.resolve(form)
		}
	} as never;
}

/** Real FormData with (or without) the picked file — no assertions needed. */
function formWith(fileValue: File | null): FormData {
	const form = new FormData();
	if (fileValue) form.append('file', fileValue);
	return form;
}

describe('POST /api/receipts', () => {
	it('stores the blob, inserts the row, returns 201', async () => {
		const uploadReceiptAsset = async ({ filename }: { filename: string }) => ({
			url: `https://blob.example/${filename}`,
			pathname: `family-master/receipts/${filename}`
		});
		const createAttachment = async (input: CreateAttachmentInput) => ({
			id: 'att-9',
			createdAt: new Date(),
			...input
		});
		const res = await POST(
			event('u1', formWith(file({ type: 'image/jpeg', size: 1024 }))),
			deps({ uploadReceiptAsset, createAttachment })
		);

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.attachment).toMatchObject({
			id: 'att-9',
			mimeType: 'image/jpeg',
			sizeBytes: 1024
		});
		expect(String(body.attachment.url)).toContain('https://blob.example/');
	});

	it('401s without a user', async () => {
		const res = await POST(event(null, formWith(file())), deps());
		expect(res.status).toBe(401);
	});

	it('400s without a file field', async () => {
		const res = await POST(event('u1', formWith(null)), deps());
		expect(res.status).toBe(400);
	});

	it('400s on unparseable multipart body', async () => {
		const res = await POST(event('u1', new FormData(), true), deps());
		expect(res.status).toBe(400);
	});

	it('415s on a non-image mime', async () => {
		const res = await POST(event('u1', formWith(file({ type: 'application/pdf' }))), deps());
		expect(res.status).toBe(415);
	});

	it('413s with the plan message when over the attachment limit', async () => {
		const res = await POST(
			event('u1', formWith(file({ type: 'image/jpeg', size: 99_999_999 }))),
			deps({
				checkSubscriptionAction: async () => ({
					canAddFamily: true,
					canViewArchive: true,
					canUploadAttachment: false,
					reason: 'File too large. Max 10MB on your plan.'
				})
			})
		);
		expect(res.status).toBe(413);
		const body = await res.json();
		expect(body.error).toMatch(/Max 10MB on your plan/);
	});

	it('propagates the user’s family onto the attachment row', async () => {
		const createAttachment = vi.fn(async (input: CreateAttachmentInput) => ({
			id: 'att-2',
			createdAt: new Date(),
			...input
		}));
		const res = await POST(
			event('u1', formWith(file())),
			deps({ createAttachment, getUserFamilyId: async () => 'f-family' })
		);

		expect(res.status).toBe(201);
		expect(createAttachment.mock.calls[0][0]).toMatchObject({
			ownerUserId: 'u1',
			familyId: 'f-family'
		});
	});
});
