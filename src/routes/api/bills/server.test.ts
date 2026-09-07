import { describe, it, expect, vi } from 'vitest';
import { GET, POST, type BillsDeps } from './+server';
import type { CreateBillInput } from '$lib/server/db/actions/bills';
import type { Attachment, Bill } from '$lib/server/db/schema';

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

function bill(over: Partial<Bill> = {}): Bill {
	return {
		id: 'bill-1',
		title: 'Electric',
		amountCents: 12000,
		dueDate: '2026-09-15T00:00:00.000Z',
		category: 'utilities',
		paidAt: null,
		userId: 'u1',
		familyId: 'f1',
		attachmentId: null,
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

function deps(over: Partial<BillsDeps> = {}): BillsDeps {
	return {
		getUserFamilyId: async () => 'f1',
		getBillsForUser: async () => [bill()],
		createBill: async (input) => bill({ ...input, id: 'bill-9' }),
		getAttachment: async () => attachment(),
		getAttachmentsByIds: async () => [],
		...over
	};
}

function event(userId: string | null, body?: Record<string, string | number | null>) {
	// SAFETY: test double — handlers only read locals.user, url, and request.json().
	return {
		locals: { user: userId ? { id: userId } : null },
		url: new URL('http://localhost/api/bills'),
		request: {
			url: 'http://localhost/api/bills',
			json: async () => body
		}
	} as never;
}

describe('GET /api/bills', () => {
	it('returns the family bills', async () => {
		const res = await GET(event('u1'), deps());
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.bills).toHaveLength(1);
		expect(body.bills[0]).toMatchObject({ id: 'bill-1', title: 'Electric', amountCents: 12000 });
	});

	it('401s without a user', async () => {
		const res = await GET(event(null), deps());
		expect(res.status).toBe(401);
	});

	it('passes the user and family through to the query', async () => {
		const getBillsForUser = vi.fn(async () => [bill()]);
		const getUserFamilyId = vi.fn(async (): Promise<string | null> => null);
		const res = await GET(event('u1'), deps({ getUserFamilyId, getBillsForUser }));
		expect(res.status).toBe(200);
		expect(getBillsForUser).toHaveBeenCalledWith('u1', null);
		expect(await res.json()).toMatchObject({ bills: [{ id: 'bill-1' }] });
	});

	it('returns a receiptsByBillId map for bills with attachments', async () => {
		const res = await GET(
			event('u1'),
			deps({
				getBillsForUser: async () => [bill({ attachmentId: 'att-1' })],
				getAttachmentsByIds: async () => [attachment()]
			})
		);
		const body = await res.json();
		expect(body.receiptsByBillId).toEqual({
			'bill-1': {
				id: 'att-1',
				url: attachment().url,
				filename: attachment().filename,
				mimeType: 'image/jpeg'
			}
		});
	});
});

describe('POST /api/bills', () => {
	it('creates a bill from dollars and returns 201', async () => {
		const createBill = vi.fn(async (input: CreateBillInput) => bill({ ...input, id: 'b9' }));
		const res = await POST(
			event('u1', { title: 'Electric', amount: 120, dueDate: '2026-09-15', category: 'utilities' }),
			deps({ createBill })
		);

		expect(res.status).toBe(201);
		expect(createBill).toHaveBeenCalledOnce();
		expect(createBill.mock.calls[0][0]).toMatchObject({
			title: 'Electric',
			amountCents: 12000,
			dueDate: '2026-09-15T00:00:00.000Z',
			category: 'utilities',
			userId: 'u1',
			familyId: 'f1'
		});
	});

	it('400s on a garbage dueDate', async () => {
		const res = await POST(event('u1', { title: 'x', amount: 1, dueDate: 'whenever' }), deps());
		expect(res.status).toBe(400);
	});

	it('400s on a wrong-typed dueDate', async () => {
		const res = await POST(event('u1', { title: 'x', amount: 1, dueDate: 123 }), deps());
		expect(res.status).toBe(400);
	});

	it('clears dueDate on explicit null', async () => {
		const createBill = vi.fn(async (input: CreateBillInput) => bill({ ...input, id: 'b9' }));
		const res = await POST(
			event('u1', { title: 'x', amount: 1, dueDate: null }),
			deps({ createBill })
		);

		expect(res.status).toBe(201);
		expect(createBill.mock.calls[0][0]).toMatchObject({ dueDate: null });
	});

	it('400s on missing title', async () => {
		const res = await POST(event('u1', { amount: 10 }), deps());
		expect(res.status).toBe(400);
	});

	it('400s on a bad amount', async () => {
		const res = await POST(event('u1', { title: 'x', amount: 'abc' }), deps());
		expect(res.status).toBe(400);
	});

	it('401s without a user', async () => {
		const res = await POST(event(null, { title: 'x', amount: 1 }), deps());
		expect(res.status).toBe(401);
	});
});

describe('POST /api/bills with attachmentId (issue 010)', () => {
	it('links an owned receipt and passes attachmentId through', async () => {
		const createBill = vi.fn(async (input: CreateBillInput) => bill({ ...input, id: 'b9' }));
		const res = await POST(
			event('u1', { title: 'Electric', amount: 100, attachmentId: 'att-1' }),
			deps({ createBill, getAttachment: async () => attachment({ id: 'att-1' }) })
		);

		expect(res.status).toBe(201);
		expect(createBill.mock.calls[0][0]).toMatchObject({ attachmentId: 'att-1' });
	});

	it('400s when attachmentId is not a string', async () => {
		const res = await POST(event('u1', { title: 'x', amount: 1, attachmentId: 42 }), deps());
		expect(res.status).toBe(400);
	});

	it('403s when the receipt belongs to someone else', async () => {
		const res = await POST(
			event('u1', { title: 'x', amount: 1, attachmentId: 'att-9' }),
			deps({
				getAttachment: async () =>
					attachment({ id: 'att-9', ownerUserId: 'u-other', familyId: null })
			})
		);
		expect(res.status).toBe(403);
	});

	it('403s when the receipt does not exist', async () => {
		const res = await POST(
			event('u1', { title: 'x', amount: 1, attachmentId: 'nope' }),
			deps({ getAttachment: async () => undefined })
		);
		expect(res.status).toBe(403);
	});
});
