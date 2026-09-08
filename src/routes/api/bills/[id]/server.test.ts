import { describe, it, expect, vi } from 'vitest';
import { PUT, DELETE, type BillIdDeps } from './+server';
import type { BillPatch } from '$lib/server/db/actions/bills';
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

function deps(over: Partial<BillIdDeps> = {}): BillIdDeps {
	return {
		getBill: async () => bill(),
		getFamilyMemberRole: async () => 'admin',
		updateBill: async () => bill({ title: 'New' }),
		deleteBill: async () => true,
		setBillItems: async () => [],
		trainTagTable: async () => {},
		...over
	};
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body capture bag; the route's own parsers validate every field under test.
function event(userId: string | null, body?: Record<string, unknown>) {
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

describe('PUT /api/bills/[id] attachmentId (storage stripped, issue 010)', () => {
	it('ignores attachmentId entirely — receipts are never stored', async () => {
		const updateBill = vi.fn(
			async (_id: string, _userId: string, _role: string | null, _patch: BillPatch) => bill()
		);
		const res = await PUT(event('u1', { attachmentId: 'att-1' }), deps({ updateBill }));

		expect(res.status).toBe(200);
		expect(updateBill).not.toHaveBeenCalled();
		expect(await res.json()).toMatchObject({ success: true });
	});
});

describe('PUT /api/bills/[id] line items (#031)', () => {
	it('replaces items, trains the Tag Table, returns reconcile fields', async () => {
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
		const res = await PUT(
			event('u1', {
				items: [
					{ label: 'Whole Milk', priceCents: 349 },
					{ label: 'Sales tax', priceCents: 96, category: 'tax' }
				]
			}),
			deps({ setBillItems, trainTagTable })
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.itemsSum).toBe(445);
		expect(body.unlabeled).toBe(1);
		expect(body.items).toHaveLength(2);
		// Replace-all against the existing bill.
		expect(setBillItems.mock.calls[0][0]).toBe('bill-1');
		expect(setBillItems.mock.calls[0][1]).toHaveLength(2);
		// Items-only save: no field patch → updateBill not called.
		expect(trainTagTable).toHaveBeenCalledOnce();
		const [userId, merchantKey, merchantCategory, entries] = trainTagTable.mock.calls[0];
		expect(userId).toBe('u1');
		expect(merchantKey).toBe('Electric');
		expect(merchantCategory).toBe('utilities');
		expect(entries).toEqual([
			{ key: 'Whole Milk', category: 'utilities', name: null },
			{ key: 'Sales tax', category: 'tax', name: null }
		]);
	});

	it('trains with the UPDATED title and category in the same request', async () => {
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		const res = await PUT(
			event('u1', {
				title: 'Kroger',
				category: 'other',
				items: [{ label: 'Milk', priceCents: 349 }]
			}),
			deps({ trainTagTable, updateBill: async () => bill({ title: 'Kroger', category: 'other' }) })
		);

		expect(res.status).toBe(200);
		const [, merchantKey, merchantCategory] = trainTagTable.mock.calls[0];
		expect(merchantKey).toBe('Kroger');
		expect(merchantCategory).toBe('other');
	});

	it('400s on invalid items without updating anything', async () => {
		const updateBill = vi.fn(
			async (_id: string, _userId: string, _role: string | null, _patch: BillPatch) => bill()
		);
		const setBillItems = vi.fn<SetItemsFn>(async () => []);
		const res = await PUT(
			event('u1', { items: [{ label: 'x', priceCents: -5 }] }),
			deps({ updateBill, setBillItems })
		);

		expect(res.status).toBe(400);
		expect(updateBill).not.toHaveBeenCalled();
		expect(setBillItems).not.toHaveBeenCalled();
	});

	it('leaves stored items untouched when items is absent', async () => {
		const setBillItems = vi.fn<SetItemsFn>(async () => []);
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		const res = await PUT(event('u1', { paid: true }), deps({ setBillItems, trainTagTable }));

		expect(res.status).toBe(200);
		expect(setBillItems).not.toHaveBeenCalled();
		expect(trainTagTable).not.toHaveBeenCalled();
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
