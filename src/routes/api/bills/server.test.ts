import { describe, it, expect, vi } from 'vitest';
import { GET, POST, type BillsDeps } from './+server';
import type { CreateBillInput } from '$lib/server/db/actions/bills';
import type { Bill } from '$lib/server/db/schema';

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
		...over
	};
}

function event(userId: string | null, body?: Record<string, string | number>) {
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
			category: 'utilities',
			userId: 'u1',
			familyId: 'f1'
		});
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
