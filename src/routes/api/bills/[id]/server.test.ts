import { describe, it, expect, vi } from 'vitest';
import { PUT, DELETE, type BillIdDeps } from './+server';
import type { BillPatch } from '$lib/server/db/actions/bills';
import type { Bill } from '$lib/server/db/schema';

/**
 * The save choreography (validation, patch, items replace-all, training
 * gate, cursor advance, draft confirmation) is pinned by
 * src/lib/server/services/billSave.test.ts — these route tests stay at
 * the HTTP seam: auth, limits, JSON mapping.
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

function deps(over: Partial<BillIdDeps> = {}): BillIdDeps {
	return {
		getUserFamilyId: async () => 'f1',
		getBill: async () => bill(),
		getFamilyMemberRole: async () => 'admin',
		createBill: async (input) => bill({ ...input, id: 'bill-9' }),
		updateBill: async () => bill({ title: 'New' }),
		deleteBill: async () => true,
		setBillItems: async () => [],
		getItemsForBills: async () => new Map(),
		trainTagTable: async () => {},
		advanceBillCursor: async () => null,
		...over
	};
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body capture bag; the module's parsers validate every field under test.
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

	it('401s without a user', async () => {
		const res = await PUT(event(null, { title: 'New' }), deps());
		expect(res.status).toBe(401);
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

describe('PUT /api/bills/[id] recurrence (#006)', () => {
	it('applies a valid recurring schedule to the patch', async () => {
		const updateBill = vi.fn(
			async (_id: string, _userId: string, _role: string | null, _patch: BillPatch) =>
				bill({ frequency: 'monthly', interval: 1 })
		);
		const res = await PUT(
			event('u1', { recurring: { frequency: 'weekly', interval: 2 } }),
			deps({ updateBill })
		);

		expect(res.status).toBe(200);
		expect(updateBill.mock.calls[0][3]).toEqual({ frequency: 'weekly', interval: 2 });
	});

	it('clears the schedule on recurring null (back to one-off)', async () => {
		const localUpdate = vi.fn(
			async (_id: string, _userId: string, _role: string | null, _patch: BillPatch) =>
				bill({ frequency: null, interval: null })
		);
		const res = await PUT(event('u1', { recurring: null }), deps({ updateBill: localUpdate }));

		expect(res.status).toBe(200);
		expect(localUpdate.mock.calls[0][3]).toEqual({ frequency: null, interval: null });
	});

	it.each<[string, unknown]>([
		['unknown frequency', { frequency: 'fortnightly', interval: 1 }],
		['zero interval', { frequency: 'monthly', interval: 0 }],
		['interval over 365', { frequency: 'monthly', interval: 366 }],
		['missing interval', { frequency: 'monthly' }],
		['non-object recurring', 'monthly']
	])('400s on %s without writing', async (_label, recurring) => {
		const localUpdate = vi.fn(
			async (_id: string, _userId: string, _role: string | null, _patch: BillPatch) => bill()
		);
		const res = await PUT(event('u1', { recurring }), deps({ updateBill: localUpdate }));

		expect(res.status).toBe(400);
		expect(localUpdate).not.toHaveBeenCalled();
	});

	it('returns the moved bill in the JSON when mark-paid advances the cursor', async () => {
		const advancedBill = bill({
			frequency: 'monthly',
			interval: 1,
			dueDate: '2026-10-01T00:00:00.000Z'
		});
		const res = await PUT(
			event('u1', { paid: true }),
			deps({
				getBill: async () => bill({ frequency: 'monthly', interval: 1 }),
				updateBill: async () =>
					bill({ frequency: 'monthly', interval: 1, paidAt: new Date().toISOString() }),
				advanceBillCursor: async () => advancedBill
			})
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.bill.dueDate).toBe('2026-10-01T00:00:00.000Z');
	});
});

describe('PUT /api/bills/[id] line items (#031)', () => {
	it('maps the reconcile fields into the 200 JSON', async () => {
		const setBillItems = vi.fn(async () => []);
		const res = await PUT(
			event('u1', {
				items: [
					{ label: 'Whole Milk', priceCents: 349 },
					{ label: 'Sales tax', priceCents: 96, category: 'tax' }
				]
			}),
			deps({ setBillItems })
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.itemsSum).toBe(445);
		expect(body.unlabeled).toBe(1);
		expect(body.items).toEqual([]);
	});

	it('items-only save skips the field patch', async () => {
		const updateBill = vi.fn(async () => bill());
		const res = await PUT(
			event('u1', { items: [{ label: 'x', priceCents: 1 }] }),
			deps({ updateBill })
		);

		expect(res.status).toBe(200);
		expect(updateBill).not.toHaveBeenCalled();
	});

	it('400s on invalid items without updating anything', async () => {
		const updateBill = vi.fn(async () => bill());
		const setBillItems = vi.fn(async () => []);
		const res = await PUT(
			event('u1', { items: [{ label: 'x', priceCents: -5 }] }),
			deps({ updateBill, setBillItems })
		);

		expect(res.status).toBe(400);
		expect(updateBill).not.toHaveBeenCalled();
		expect(setBillItems).not.toHaveBeenCalled();
	});

	it('leaves stored items untouched when items is absent', async () => {
		const setBillItems = vi.fn(async () => []);
		const res = await PUT(event('u1', { paid: true }), deps({ setBillItems }));

		expect(res.status).toBe(200);
		expect(setBillItems).not.toHaveBeenCalled();
	});
});

describe('PUT /api/bills/[id] draft confirmation (#033)', () => {
	it('confirmDraft on a manual bill is a no-op 200', async () => {
		const updateBill = vi.fn(async () => bill());
		const res = await PUT(event('u1', { confirmDraft: true }), deps({ updateBill }));

		expect(res.status).toBe(200);
		expect(updateBill).not.toHaveBeenCalled();
		expect(await res.json()).toMatchObject({ success: true, bill: { id: 'bill-1' } });
	});

	it('confirming an email draft returns the confirmed bill', async () => {
		const updateBill = vi.fn(
			async (_id: string, _userId: string, _role: string | null, patch: BillPatch) =>
				bill({ source: patch.source ?? 'email', category: 'other', title: 'KROGER #4412' })
		);
		const res = await PUT(
			event('u1', { confirmDraft: true }),
			deps({
				getBill: async () => bill({ source: 'email', category: 'other', title: 'KROGER #4412' }),
				updateBill
			})
		);

		expect(res.status).toBe(200);
		expect(updateBill).toHaveBeenCalledWith('bill-1', 'u1', 'admin', { source: 'manual' });
		expect(await res.json()).toMatchObject({ success: true, bill: { source: 'manual' } });
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
