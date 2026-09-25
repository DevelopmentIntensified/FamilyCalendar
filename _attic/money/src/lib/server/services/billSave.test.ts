import { describe, it, expect, vi } from 'vitest';
import {
	applyBillSave,
	BillSaveNotFoundError,
	BillSaveValidationError,
	type BillSaveDeps
} from './billSave';
import type { Bill, ReceiptItem } from '$lib/server/db/schema';

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
		frequency: null,
		interval: null,
		source: 'manual',
		userId: 'u1',
		familyId: 'f1',
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

function deps(over: Partial<BillSaveDeps> = {}): BillSaveDeps {
	return {
		getUserFamilyId: async () => 'f1',
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

/** Fake setBillItems that mirrors the real row shape for reconcile checks. */
function fakeSetItems(): ReturnType<typeof vi.fn<SetItemsFn>> {
	return vi.fn<SetItemsFn>(async (billId, items) =>
		items.map((it, i) => ({
			id: `ri-${i}`,
			billId,
			label: it.label,
			priceCents: it.priceCents,
			category: it.category,
			name: it.name,
			position: i,
			createdAt: new Date('2026-09-01T00:00:00Z')
		}))
	);
}

const MILK = { label: 'Whole Milk', priceCents: 349 };

describe('applyBillSave — create (billId null)', () => {
	it('creates the bill from validated body fields', async () => {
		const createBill = vi.fn(async (input) => bill({ ...input, id: 'bill-9' }));
		const r = await applyBillSave(
			deps({ createBill }),
			{ userId: 'u1' },
			{
				billId: null,
				body: {
					title: 'Electric',
					amount: 120,
					dueDate: '2026-09-15',
					category: 'utilities',
					recurring: { frequency: 'monthly', interval: 1 }
				}
			}
		);

		expect(r.bill.id).toBe('bill-9');
		expect(createBill).toHaveBeenCalledOnce();
		expect(createBill.mock.calls[0][0]).toMatchObject({
			title: 'Electric',
			amountCents: 12000,
			dueDate: '2026-09-15T00:00:00.000Z',
			category: 'utilities',
			userId: 'u1',
			familyId: 'f1',
			frequency: 'monthly',
			interval: 1
		});
		expect(r.items).toBeNull();
		expect(r.events.trained).toBe(false);
		expect(r.events.advancedTo).toBeNull();
	});

	it('creates with items: replace-all store + train + reconcile summary', async () => {
		const setBillItems = fakeSetItems();
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		const r = await applyBillSave(
			deps({ setBillItems, trainTagTable }),
			{ userId: 'u1' },
			{
				billId: null,
				body: {
					title: 'Kroger',
					amount: 25.5,
					category: 'other',
					items: [
						MILK,
						{ label: 'Sales tax', priceCents: 96, category: 'tax' },
						{ label: '4011', priceCents: 100, category: 'utilities', name: 'Banana' }
					]
				}
			}
		);

		expect(setBillItems.mock.calls[0][0]).toBe('bill-9');
		expect(r.items).toHaveLength(3);
		expect(r.itemsSum).toBe(545);
		expect(r.unlabeled).toBe(1);
		expect(r.events.trained).toBe(true);
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

	it('validates before anything is written (title, amount, items, dueDate, recurring)', async () => {
		// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body bag; the module's parsers validate every field under test.
		const cases: Array<[string, Record<string, unknown>, string]> = [
			['missing title', { amount: 10 }, 'Title is required'],
			['blank title', { title: '  ', amount: 10 }, 'Title is required'],
			['bad amount', { title: 'x', amount: 'abc' }, 'Amount must be a non-negative number'],
			['bad items', { title: 'x', amount: 1, items: [{ label: '', priceCents: 1 }] }, ''],
			['items not array', { title: 'x', amount: 1, items: 'nope' }, ''],
			[
				'too many items',
				{
					title: 'x',
					amount: 1,
					items: Array.from({ length: 51 }, (_, i) => ({ label: `i${i}`, priceCents: 1 }))
				},
				''
			],
			[
				'bad dueDate',
				{ title: 'x', amount: 1, dueDate: 'whenever' },
				'Due date must be a valid date'
			],
			[
				'wrong-typed dueDate',
				{ title: 'x', amount: 1, dueDate: 123 },
				'Due date must be a valid date'
			],
			[
				'bad recurring',
				{ title: 'x', amount: 1, recurring: { frequency: 'fortnightly', interval: 1 } },
				''
			]
		];
		const createBill = vi.fn(async (input) => bill({ ...input, id: 'bill-9' }));
		const setBillItems = vi.fn<SetItemsFn>(async () => []);
		for (const [_label, body, message] of cases) {
			await expect(
				applyBillSave(deps({ createBill, setBillItems }), { userId: 'u1' }, { billId: null, body })
			).rejects.toThrow(message ? message : undefined);
			await expect(
				applyBillSave(deps({ createBill, setBillItems }), { userId: 'u1' }, { billId: null, body })
			).rejects.toBeInstanceOf(BillSaveValidationError);
		}
		expect(createBill).not.toHaveBeenCalled();
		expect(setBillItems).not.toHaveBeenCalled();
	});

	it('null dueDate clears, recurring null/absent stores a one-off', async () => {
		const createBill = vi.fn(async (input) => bill({ ...input, id: 'bill-9' }));
		const r = await applyBillSave(
			deps({ createBill }),
			{ userId: 'u1' },
			{ billId: null, body: { title: 'x', amount: 1, dueDate: null, recurring: null } }
		);
		expect(createBill.mock.calls[0][0]).toMatchObject({
			dueDate: null,
			frequency: null,
			interval: null
		});
		expect(r.events.trained).toBe(false);
	});
});

describe('applyBillSave — update (billId set)', () => {
	it('applies the patch and returns the updated bill', async () => {
		const updateBill = vi.fn(async (_id, _userId, _role, _patch) => bill({ title: 'New' }));
		const r = await applyBillSave(
			deps({ updateBill }),
			{ userId: 'u1' },
			{ billId: 'bill-1', body: { title: 'New' } }
		);
		expect(updateBill).toHaveBeenCalledWith('bill-1', 'u1', 'admin', { title: 'New' });
		expect(r.bill.title).toBe('New');
		expect(r.items).toBeNull();
		expect(r.events.trained).toBe(false);
	});

	it('404s on a missing bill without writing', async () => {
		const updateBill = vi.fn(async () => bill());
		await expect(
			applyBillSave(
				deps({ getBill: async () => undefined, updateBill }),
				{ userId: 'u1' },
				{ billId: 'bill-1', body: { title: 'New' } }
			)
		).rejects.toBeInstanceOf(BillSaveNotFoundError);
		expect(updateBill).not.toHaveBeenCalled();
	});

	it('404s when the caller may not mutate (plain member)', async () => {
		await expect(
			applyBillSave(
				deps({ getFamilyMemberRole: async () => 'member' }),
				{ userId: 'u2' },
				{ billId: 'bill-1', body: { title: 'Hijacked' } }
			)
		).rejects.toBeInstanceOf(BillSaveNotFoundError);
	});

	it('empty patch is a no-op: no update, no train, current bill back', async () => {
		const updateBill = vi.fn(async () => bill());
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		const r = await applyBillSave(
			deps({ updateBill, trainTagTable }),
			{ userId: 'u1' },
			{ billId: 'bill-1', body: {} }
		);
		expect(updateBill).not.toHaveBeenCalled();
		expect(trainTagTable).not.toHaveBeenCalled();
		expect(r.bill.id).toBe('bill-1');
		expect(r.events.trained).toBe(false);
	});

	it('items-only save skips the bill update but replaces items and trains', async () => {
		const updateBill = vi.fn(async () => bill());
		const setBillItems = fakeSetItems();
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		const r = await applyBillSave(
			deps({ updateBill, setBillItems, trainTagTable }),
			{ userId: 'u1' },
			{ billId: 'bill-1', body: { items: [MILK] } }
		);
		expect(updateBill).not.toHaveBeenCalled();
		expect(setBillItems).toHaveBeenCalledOnce();
		expect(r.itemsSum).toBe(349);
		expect(r.events.trained).toBe(true);
		const [, merchantKey, merchantCategory] = trainTagTable.mock.calls[0];
		expect(merchantKey).toBe('Electric');
		expect(merchantCategory).toBe('utilities');
	});

	it('validates before anything is written', async () => {
		const updateBill = vi.fn(async () => bill());
		const setBillItems = vi.fn<SetItemsFn>(async () => []);
		// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body bag; the module's parsers validate every field under test.
		const cases: Array<Record<string, unknown>> = [
			{ amount: 'lots' },
			{ title: '' },
			{ dueDate: 'not-a-date' },
			{ dueDate: 123 },
			{ recurring: { frequency: 'monthly', interval: 0 } },
			{ items: [{ label: 'x', priceCents: -5 }] }
		];
		for (const body of cases) {
			await expect(
				applyBillSave(
					deps({ updateBill, setBillItems }),
					{ userId: 'u1' },
					{ billId: 'bill-1', body }
				)
			).rejects.toBeInstanceOf(BillSaveValidationError);
		}
		expect(updateBill).not.toHaveBeenCalled();
		expect(setBillItems).not.toHaveBeenCalled();
	});

	it('trains with the UPDATED title and category in the same request', async () => {
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		await applyBillSave(
			deps({
				trainTagTable,
				updateBill: async () => bill({ title: 'Kroger', category: 'other' })
			}),
			{ userId: 'u1' },
			{
				billId: 'bill-1',
				body: { title: 'Kroger', category: 'other', items: [{ label: 'Milk', priceCents: 349 }] }
			}
		);
		const [, merchantKey, merchantCategory] = trainTagTable.mock.calls[0];
		expect(merchantKey).toBe('Kroger');
		expect(merchantCategory).toBe('other');
	});

	it('mark-paid on a recurring bill advances the cursor', async () => {
		const advancedBill = bill({
			frequency: 'monthly',
			interval: 1,
			dueDate: '2026-10-01T00:00:00.000Z'
		});
		const advanceBillCursor = vi.fn(async (_id: string, _paidAt: string) => advancedBill);
		const r = await applyBillSave(
			deps({
				getBill: async () => bill({ frequency: 'monthly', interval: 1 }),
				updateBill: async () =>
					bill({ frequency: 'monthly', interval: 1, paidAt: new Date().toISOString() }),
				advanceBillCursor
			}),
			{ userId: 'u1' },
			{ billId: 'bill-1', body: { paid: true } }
		);
		expect(advanceBillCursor).toHaveBeenCalledOnce();
		expect(r.events.advancedTo).toBe('2026-10-01T00:00:00.000Z');
		expect(r.bill.dueDate).toBe('2026-10-01T00:00:00.000Z');
	});

	it('mark-paid on a one-off bill does not advance', async () => {
		const advanceBillCursor = vi.fn(async () => null);
		const r = await applyBillSave(
			deps({ advanceBillCursor }),
			{ userId: 'u1' },
			{ billId: 'bill-1', body: { paid: true } }
		);
		expect(advanceBillCursor).not.toHaveBeenCalled();
		expect(r.events.advancedTo).toBeNull();
	});

	it('unmark-paid never rewinds the cursor', async () => {
		const advanceBillCursor = vi.fn(async () => null);
		await applyBillSave(
			deps({
				getBill: async () => bill({ frequency: 'monthly', interval: 1 }),
				advanceBillCursor
			}),
			{ userId: 'u1' },
			{ billId: 'bill-1', body: { paid: false } }
		);
		expect(advanceBillCursor).not.toHaveBeenCalled();
	});
});

describe('applyBillSave — draft confirmation (#033)', () => {
	const storedItems: ReceiptItem[] = [
		{
			id: 'ri-1',
			billId: 'bill-1',
			label: 'WHOLE MILK',
			priceCents: 349,
			category: null,
			position: 0,
			createdAt: new Date('2026-09-01T00:00:00Z')
		}
	];

	function draftDeps(over: Partial<BillSaveDeps> = {}): BillSaveDeps {
		return deps({
			getBill: async () => bill({ source: 'email', category: 'other', title: 'KROGER #4412' }),
			getItemsForBills: async () => new Map([['bill-1', storedItems]]),
			...over
		});
	}

	it('confirm-only: flips source to manual and trains from stored items', async () => {
		const updateBill = vi.fn(async (_id, _userId, _role, patch) =>
			bill({ source: patch.source ?? 'email', category: 'other', title: 'KROGER #4412' })
		);
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		const r = await applyBillSave(
			draftDeps({ updateBill, trainTagTable }),
			{ userId: 'u1' },
			{ billId: 'bill-1', body: { confirmDraft: true } }
		);
		expect(updateBill).toHaveBeenCalledWith('bill-1', 'u1', 'admin', { source: 'manual' });
		expect(r.events.trained).toBe(true);
		const [userId, merchantKey, merchantCategory, entries] = trainTagTable.mock.calls[0];
		expect(userId).toBe('u1');
		expect(merchantKey).toBe('KROGER #4412');
		expect(merchantCategory).toBe('other');
		expect(entries).toEqual([{ key: 'WHOLE MILK', category: 'other', name: null }]);
	});

	it('confirming alongside an items save trains with the NEW items (not stored)', async () => {
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		const updateBill = vi.fn(async (_id, _userId, _role, patch) =>
			bill({ source: patch.source ?? 'email', category: 'other', title: 'KROGER #4412' })
		);
		await applyBillSave(
			draftDeps({ updateBill, trainTagTable }),
			{ userId: 'u1' },
			{
				billId: 'bill-1',
				body: { confirmDraft: true, items: [{ label: 'Bagel', priceCents: 300 }] }
			}
		);
		expect(trainTagTable).toHaveBeenCalledOnce();
		expect(trainTagTable.mock.calls[0][3]).toEqual([
			{ key: 'Bagel', category: 'other', name: null }
		]);
	});

	it('editing items on an UNCONFIRMED draft never trains', async () => {
		const setBillItems = fakeSetItems();
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		const r = await applyBillSave(
			draftDeps({ setBillItems, trainTagTable }),
			{ userId: 'u1' },
			{ billId: 'bill-1', body: { items: [{ label: 'Bagel', priceCents: 300 }] } }
		);
		expect(setBillItems).toHaveBeenCalledOnce();
		expect(trainTagTable).not.toHaveBeenCalled();
		expect(r.events.trained).toBe(false);
	});

	it('confirmDraft on a manual bill is a no-op patch (no update, no train)', async () => {
		const updateBill = vi.fn(async () => bill());
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		await applyBillSave(
			deps({ updateBill, trainTagTable }),
			{ userId: 'u1' },
			{ billId: 'bill-1', body: { confirmDraft: true } }
		);
		expect(updateBill).not.toHaveBeenCalled();
		expect(trainTagTable).not.toHaveBeenCalled();
	});
});

describe('applyBillSave — gate matrix (#031)', () => {
	/** Each row: save shape → expected trained flag (and why). */
	const matrix: Array<{
		name: string;
		// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- request-body bag; the module's parsers validate every field under test.
		body: Record<string, unknown>;
		created?: Partial<Bill>;
		existing?: Partial<Bill>;
		trained: boolean;
	}> = [
		{
			name: 'create-with-items (manual) trains',
			body: { title: 'x', amount: 1, items: [MILK] },
			trained: true
		},
		{
			name: 'create-draft-email never trains',
			body: { title: 'x', amount: 1, items: [MILK] },
			created: { source: 'email' },
			trained: false
		},
		{ name: 'create without items never trains', body: { title: 'x', amount: 1 }, trained: false },
		{
			name: 'update-confirm trains from stored items',
			body: { confirmDraft: true },
			existing: { source: 'email' },
			trained: true
		},
		{
			name: 'update-draft-edit does not train',
			body: { items: [MILK] },
			existing: { source: 'email' },
			trained: false
		},
		{
			name: 'update-with-items on manual trains',
			body: { items: [MILK] },
			existing: {},
			trained: true
		},
		{
			name: "'other' still trains",
			body: {
				title: 'x',
				amount: 1,
				category: 'other',
				items: [{ label: 'Mystery', priceCents: 1, category: 'other' }]
			},
			trained: true
		},
		{ name: 'empty patch never trains', body: {}, existing: {}, trained: false }
	];

	it.each(matrix)('$name', async (row) => {
		const trainTagTable = vi.fn<TrainFn>(async () => {});
		const createdOver: Partial<Bill> = row.created ?? {};
		const existingOver: Partial<Bill> = row.existing ?? {};
		const d = deps({
			trainTagTable,
			createBill: async (input) => bill({ ...input, id: 'bill-9', ...createdOver }),
			getBill: async () => bill(existingOver),
			getItemsForBills: async () =>
				new Map([
					[
						'bill-1',
						[
							{
								id: 'ri-1',
								billId: 'bill-1',
								label: 'WHOLE MILK',
								priceCents: 349,
								category: null,
								position: 0,
								createdAt: new Date('2026-09-01T00:00:00Z')
							}
						]
					]
				])
		});
		const r = await applyBillSave(
			d,
			{ userId: 'u1' },
			{ billId: row.existing ? 'bill-1' : null, body: row.body }
		);
		expect(r.events.trained).toBe(row.trained);
		if (row.trained) expect(trainTagTable).toHaveBeenCalledOnce();
		else expect(trainTagTable).not.toHaveBeenCalled();
	});
});
