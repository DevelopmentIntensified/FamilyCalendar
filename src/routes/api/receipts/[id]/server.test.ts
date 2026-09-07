import { describe, it, expect, vi } from 'vitest';
import { DELETE, type ReceiptIdDeps } from './+server';
import type { Attachment } from '$lib/server/db/schema';

function attachment(over: Partial<Attachment> = {}): Attachment {
	return {
		id: 'att-1',
		ownerUserId: 'u1',
		familyId: 'f1',
		url: 'https://blob.example/family-master/receipts/a.jpg',
		filename: 'family-master/receipts/a.jpg',
		mimeType: 'image/jpeg',
		sizeBytes: 1000,
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

function deps(over: Partial<ReceiptIdDeps> = {}): ReceiptIdDeps {
	return {
		getAttachment: async () => attachment(),
		getFamilyMemberRole: async () => 'member',
		deleteAttachment: async () => true,
		deleteReceiptAsset: async () => {},
		...over
	};
}

function event(userId: string | null): never {
	// SAFETY: test double — handlers only read locals.user, params.id, and url.
	return {
		locals: { user: userId ? { id: userId } : null },
		params: { id: 'att-1' },
		url: new URL('http://localhost/api/receipts/att-1')
	} as never;
}

describe('DELETE /api/receipts/[id]', () => {
	it('deletes blob + row for the owner and returns success', async () => {
		const deleteReceiptAsset = vi.fn(async () => {});
		const res = await DELETE(
			event('u1'),
			deps({ deleteAttachment: async () => true, deleteReceiptAsset })
		);

		expect(res.status).toBe(200);
		expect(deleteReceiptAsset).toHaveBeenCalledWith(
			'https://blob.example/family-master/receipts/a.jpg'
		);
	});

	it('allows a family admin who is not the owner', async () => {
		const res = await DELETE(event('u2'), deps({ getFamilyMemberRole: async () => 'admin' }));
		expect(res.status).toBe(200);
	});

	it('404s when the attachment is missing', async () => {
		const res = await DELETE(event('u1'), deps({ getAttachment: async () => undefined }));
		expect(res.status).toBe(404);
	});

	it('404s for a plain member who is not the owner', async () => {
		const res = await DELETE(event('u2'), deps({ getFamilyMemberRole: async () => 'member' }));
		expect(res.status).toBe(404);
	});

	it('404s for a stranger with no family role', async () => {
		const res = await DELETE(event('u3'), deps({ getFamilyMemberRole: async () => null }));
		expect(res.status).toBe(404);
	});

	it('404s when nothing was deleted (raced delete)', async () => {
		const res = await DELETE(event('u1'), deps({ deleteAttachment: async () => false }));
		expect(res.status).toBe(404);
	});

	it('401s without a user', async () => {
		const res = await DELETE(event(null), deps());
		expect(res.status).toBe(401);
	});
});
