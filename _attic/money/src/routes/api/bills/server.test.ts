import { describe, it, expect, vi } from 'vitest';
import { GET, POST, type BillsDeps } from './+server';
import type { CreateBillInput } from '$lib/server/db/actions/bills';
import type { Bill } from '$lib/server/db/schema';

/**
 * The save choreography (validation, items replace-all, training gate,
 * cursor advance) is pinned by src/lib/server/services/billSave.test.ts —
 * these route tests stay at the HTTP seam: auth, limits, JSON mapping.
 */
function bill(over: Partial<Bill> = {}): Bill {
	return {
		id: 'bill-1',
		title: 'Electric',
		amountCents: 12000,
		dueDate: '2026-09-15T00:00:00.000Z',
		category: 'utilities',
		paidAt: null,
		frequency: null,
		interval: null,
		source: 'manual',
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
		getBill: async () => bill(),
		getFamilyMemberRole: async () => 'admin',
		createBill: async (input) => bill({ ...input, id: 'bill-9' }),
		updateBill: async () => bill({ title: 'New' }),
		setBillItems: async () => [],
		getItemsForBills: async () => new Map(),
		trainTagTable: async () => {},
		advanceBillCursor: async () => null,
		...over
	};
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body capture bag; the module's parsers validate every field under test.
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
	it('maps the reconcile fields into the 201 JSON', async () => {
		const setBillItems = vi.fn(async () => []);
		const res = await POST(
			event('u1', {
				title: 'Kroger',
				amount: 25.5,
				items: [
					{ label: 'Whole Milk', priceCents: 349 },
					{ label: 'Sales tax', priceCents: 96, category: 'tax' }
				]
			}),
			deps({ setBillItems })
		);

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.itemsSum).toBe(445);
		expect(body.unlabeled).toBe(1);
		expect(body.items).toEqual([]);
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

	it('omits the item fields from the JSON when items are absent', async () => {
		const res = await POST(
			event('u1', { title: 'Electric', amount: 120, category: 'utilities' }),
			deps()
		);

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.items).toBeUndefined();
		expect(body.itemsSum).toBeUndefined();
	});
});

describe('POST /api/bills recurrence (#006)', () => {
	it('stores a valid recurring schedule on the new bill', async () => {
		const createBill = vi.fn(async (input: CreateBillInput) => bill({ ...input, id: 'b9' }));
		const res = await POST(
			event('u1', {
				title: 'Rent',
				amount: 1500,
				recurring: { frequency: 'monthly', interval: 1 }
			}),
			deps({ createBill })
		);

		expect(res.status).toBe(201);
		expect(createBill.mock.calls[0][0]).toMatchObject({ frequency: 'monthly', interval: 1 });
	});

	it.each<[string, unknown]>([
		['unknown frequency', { frequency: 'fortnightly', interval: 1 }],
		['parser token frequency', { frequency: 'biweekly', interval: 1 }],
		['zero interval', { frequency: 'monthly', interval: 0 }],
		['interval over 365', { frequency: 'monthly', interval: 366 }],
		['non-integer interval', { frequency: 'monthly', interval: 1.5 }],
		['missing interval', { frequency: 'monthly' }],
		['non-object recurring', 'monthly']
	])('400s on %s', async (_label, recurring) => {
		const createBill = vi.fn(async (input: CreateBillInput) => bill({ ...input, id: 'b9' }));
		const res = await POST(event('u1', { title: 'x', amount: 1, recurring }), deps({ createBill }));

		expect(res.status).toBe(400);
		expect(createBill).not.toHaveBeenCalled();
	});

	it('stores a one-off when recurring is null', async () => {
		const createBill = vi.fn(async (input: CreateBillInput) => bill({ ...input, id: 'b9' }));
		const res = await POST(
			event('u1', { title: 'x', amount: 1, recurring: null }),
			deps({ createBill })
		);

		expect(res.status).toBe(201);
		expect(createBill.mock.calls[0][0]).toMatchObject({ frequency: null, interval: null });
	});

	it('stores a one-off when recurring is absent', async () => {
		const createBill = vi.fn(async (input: CreateBillInput) => bill({ ...input, id: 'b9' }));
		const res = await POST(event('u1', { title: 'x', amount: 1 }), deps({ createBill }));

		expect(res.status).toBe(201);
		expect(createBill.mock.calls[0][0]).toMatchObject({ frequency: null, interval: null });
	});
});
