import { describe, it, expect, vi } from 'vitest';
import { GET, POST, type BillsDeps } from './+server';
import type { CreateBillInput } from '$lib/server/db/actions/bills';
import type { Bill } from '$lib/server/db/schema';

/** Real dep signatures, referenced type-only via dynamic import (no import). */
type TrainFn = (typeof import('$lib/server/services/tagTable'))['trainTagTable'];
type SetItemsFn = (typeof import('$lib/server/db/actions/bills'))['setBillItems'];

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
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

function deps(over: Partial<BillsDeps> = {}): BillsDeps {
	return {
		getUserFamilyId: async () => 'f1',
		getBillsForUser: async () => [bill()],
		createBill: async (input) => bill({ ...input, id: 'bill-9' }),
		setBillItems: async () => [],
		trainTagTable: async () => {},
		...over
	};
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body capture bag; the route's own parsers validate every field under test.
function event(userId: string | null, body?: Record<string, unknown>) {
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

	it('returns bills only — no receiptsByBillId (receipts are never stored, issue 010)', async () => {
		const res = await GET(event('u1'), deps());
		const body = await res.json();
		expect(body.receiptsByBillId).toBeUndefined();
		expect(body.bills[0].attachmentId).toBeUndefined();
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

	it('ignores a client-sent attachmentId — receipts are never stored (issue 010)', async () => {
		const createBill = vi.fn(async (input: CreateBillInput) => bill({ ...input, id: 'b9' }));
		const res = await POST(
			event('u1', { title: 'Electric', amount: 100, attachmentId: 'att-1' }),
			deps({ createBill })
		);

		expect(res.status).toBe(201);
		expect(createBill.mock.calls[0][0]).not.toHaveProperty('attachmentId');
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

describe('POST /api/bills line items (#031)', () => {
	it('creates the bill, stores items, trains the Tag Table, returns reconcile fields', async () => {
		// SAFETY: typed fakes — the real signatures pin the call shapes the
		// route must honor, so no cast chains are needed on mock.calls.
		const setBillItems = vi.fn<SetItemsFn>(async (_id, items) =>
			items.map((it, i) => ({
				id: `ri-${i}`,
				billId: _id,
				label: it.label,
				priceCents: it.priceCents,
				category: it.category,
				name: it.name,
				position: i,
				createdAt: new Date('2026-09-01T00:00:00Z')
			}))
		);
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		const res = await POST(
			event('u1', {
				title: 'Kroger',
				amount: 25.5,
				category: 'other',
				items: [
					{ label: 'Whole Milk', priceCents: 349 },
					{ label: 'Sales tax', priceCents: 96, category: 'tax' },
					{ label: '4011', priceCents: 100, category: 'utilities', name: 'Banana' }
				]
			}),
			deps({
				createBill: async (input) => bill({ ...input, id: 'b9' }),
				setBillItems,
				trainTagTable
			})
		);

		expect(res.status).toBe(201);
		const body = await res.json();
		// Soft reconcile: sum + unlabeled count, never a block.
		expect(body.itemsSum).toBe(545);
		expect(body.unlabeled).toBe(1);
		expect(body.items).toHaveLength(3);
		// Replace-all persistence against the created bill.
		expect(setBillItems.mock.calls[0][0]).toBe('b9');
		expect(setBillItems.mock.calls[0][1]).toHaveLength(3);
		// Training: merchant = bill title, item keys label-derived, SKU name kept.
		expect(trainTagTable).toHaveBeenCalledOnce();
		const [userId, merchantKey, merchantCategory, entries] = trainTagTable.mock.calls[0];
		expect(userId).toBe('u1');
		expect(merchantKey).toBe('Kroger');
		expect(merchantCategory).toBe('other');
		expect(entries).toEqual([
			{ key: 'Whole Milk', category: 'other', name: null },
			{ key: 'Sales tax', category: 'tax', name: null },
			{ key: '4011', category: 'utilities', name: 'Banana' }
		]);
	});

	it('validates items before creating the bill', async () => {
		const createBill = vi.fn(async (input: CreateBillInput) => bill({ ...input, id: 'b9' }));
		const res = await POST(
			event('u1', { title: 'x', amount: 1, items: [{ label: '', priceCents: 1 }] }),
			deps({ createBill })
		);

		expect(res.status).toBe(400);
		expect(createBill).not.toHaveBeenCalled();
	});

	it('400s on more than 50 items without creating the bill', async () => {
		const createBill = vi.fn(async (input: CreateBillInput) => bill({ ...input, id: 'b9' }));
		const items = Array.from({ length: 51 }, (_, i) => ({ label: `i${i}`, priceCents: 1 }));
		const res = await POST(event('u1', { title: 'x', amount: 1, items }), deps({ createBill }));

		expect(res.status).toBe(400);
		expect(createBill).not.toHaveBeenCalled();
	});

	it('creates without items and does not train', async () => {
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		const res = await POST(
			event('u1', { title: 'Electric', amount: 120, category: 'utilities' }),
			deps({ trainTagTable })
		);

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.items).toBeUndefined();
		expect(body.itemsSum).toBeUndefined();
		expect(trainTagTable).not.toHaveBeenCalled();
	});

	it('still trains when every item is labeled "other"', async () => {
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		const res = await POST(
			event('u1', {
				title: 'Corner Shop',
				amount: 10,
				items: [{ label: 'Mystery Gadget', priceCents: 1000, category: 'other' }]
			}),
			deps({ trainTagTable })
		);

		expect(res.status).toBe(201);
		expect(trainTagTable).toHaveBeenCalledOnce();
	});
});
