import { describe, it, expect, vi } from 'vitest';
import { PUT, DELETE, type BillIdDeps } from './+server';
import type { BillPatch } from '$lib/server/db/actions/bills';
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

function deps(over: Partial<BillIdDeps> = {}): BillIdDeps {
	return {
		getBill: async () => bill(),
		getFamilyMemberRole: async () => 'admin',
		updateBill: async () => bill({ title: 'New' }),
		deleteBill: async () => true,
		...over
	};
}

function event(userId: string | null, body?: Record<string, string | number | boolean | null>) {
	// SAFETY: test double — handlers only read locals.user, params.id, and request.json().
	return {
		locals: { user: userId ? { id: userId } : null },
		params: { id: 'bill-1' },
		request: {
			url: 'http://localhost/api/bills/bill-1',
			json: async () => body
		}
	} as never;
}

describe('PUT /api/bills/[id]', () => {
	it('updates and returns the bill', async () => {
		const updateBill = vi.fn(
			async (_id: string, _userId: string, _role: string | null, _patch: BillPatch) =>
				bill({ title: 'New' })
		);
		const res = await PUT(event('u1', { title: 'New' }), deps({ updateBill }));

		expect(res.status).toBe(200);
		expect(updateBill).toHaveBeenCalledWith('bill-1', 'u1', 'admin', { title: 'New' });
	});

	it('404s on a missing bill', async () => {
		const res = await PUT(event('u1', { title: 'New' }), deps({ getBill: async () => undefined }));
		expect(res.status).toBe(404);
	});

	it('403s when forbidden', async () => {
		const res = await PUT(
			event('u2', { title: 'Hijacked' }),
			deps({
				getBill: async () => bill(),
				getFamilyMemberRole: async () => 'member',
				updateBill: async () => null
			})
		);
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: 'Bill not found' });
	});

	it('400s on a bad amount', async () => {
		const res = await PUT(event('u1', { amount: 'lots' }), deps());
		expect(res.status).toBe(400);
	});

	it('ignores familyId in the patch', async () => {
		const updateBill = vi.fn(
			async (_id: string, _userId: string, _role: string | null, _patch: BillPatch) =>
				bill({ title: 'New' })
		);
		const res = await PUT(event('u1', { title: 'New', familyId: 'f2' }), deps({ updateBill }));

		expect(res.status).toBe(200);
		expect(updateBill).toHaveBeenCalledWith('bill-1', 'u1', 'admin', { title: 'New' });
	});

	it('returns the current bill on an empty patch without calling updateBill', async () => {
		const updateBill = vi.fn(async () => bill());
		const res = await PUT(event('u1', {}), deps({ updateBill }));

		expect(res.status).toBe(200);
		expect(updateBill).not.toHaveBeenCalled();
		expect(await res.json()).toMatchObject({ success: true, bill: { id: 'bill-1' } });
	});

	it.each<[string, string | number]>([
		['garbage', 'not-a-date'],
		['wrong type', 123]
	])('400s on %s dueDate', async (_label, raw) => {
		const res = await PUT(event('u1', { dueDate: raw }), deps());
		expect(res.status).toBe(400);
	});

	it('anchors date-only dueDate to UTC midnight', async () => {
		const updateBill = vi.fn(
			async (_id: string, _userId: string, _role: string | null, _patch: BillPatch) => bill()
		);
		const res = await PUT(event('u1', { dueDate: '2026-09-15' }), deps({ updateBill }));

		expect(res.status).toBe(200);
		expect(updateBill.mock.calls[0][3]).toEqual({ dueDate: '2026-09-15T00:00:00.000Z' });
	});

	it('clears dueDate on explicit null', async () => {
		const updateBill = vi.fn(
			async (_id: string, _userId: string, _role: string | null, _patch: BillPatch) => bill()
		);
		const res = await PUT(event('u1', { dueDate: null }), deps({ updateBill }));

		expect(res.status).toBe(200);
		expect(updateBill.mock.calls[0][3]).toEqual({ dueDate: null });
	});
});

describe('DELETE /api/bills/[id]', () => {
	it('deletes and returns success', async () => {
		const res = await DELETE(event('u1'), deps());
		expect(await res.json()).toEqual({ success: true });
	});

	it('404s on a missing bill', async () => {
		const res = await DELETE(event('u1'), deps({ getBill: async () => undefined }));
		expect(res.status).toBe(404);
	});

	it('403s when forbidden', async () => {
		const res = await DELETE(
			event('u2'),
			deps({
				getBill: async () => bill(),
				getFamilyMemberRole: async () => 'member',
				deleteBill: async () => false
			})
		);
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: 'Bill not found' });
	});
});
