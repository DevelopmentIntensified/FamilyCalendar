import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SQL } from 'drizzle-orm';

/**
 * Bills action tests. The drizzle query-builder is scripted (same pattern as
 * calendar.test.ts); permission predicates are pure and need no stub.
 * Justified mock: see docs/issues/002.
 */

/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null | Date>;

interface StubState {
	selectQueue: Row[][];
	orderByArgs: SQL[];
	insertValues: Row | null;
	insertReturn: Row[];
	updateValues: Row | null;
	updateReturn: Row[];
	deleteReturn: Row[];
	// tx (transaction) captures for setBillItems.
	transactionOpened: boolean;
	txDeleted: unknown[];
	txInsertValues: Row[] | null;
	txInsertReturn: Row[];
}

const state = vi.hoisted(
	(): StubState => ({
		selectQueue: [],
		orderByArgs: [],
		insertValues: null,
		insertReturn: [],
		updateValues: null,
		updateReturn: [],
		deleteReturn: [],
		transactionOpened: false,
		txDeleted: [],
		txInsertValues: null,
		txInsertReturn: []
	})
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: (...args: SQL[]) => {
						state.orderByArgs = args;
						return Promise.resolve(state.selectQueue.shift() ?? []);
					},
					limit: () => Promise.resolve(state.selectQueue.shift() ?? [])
				})
			})
		}),
		insert: () => ({
			values: (v: Row) => {
				state.insertValues = v;
				return {
					returning: () => Promise.resolve(state.insertReturn)
				};
			}
		}),
		update: () => ({
			set: (v: Row) => {
				state.updateValues = v;
				return {
					where: () => ({
						returning: () => Promise.resolve(state.updateReturn)
					})
				};
			}
		}),
		delete: () => ({
			where: () => ({
				returning: () => Promise.resolve(state.deleteReturn)
			})
		}),
		// oxlint-disable-next-line anti-slop/no-unknown-parameters,anti-slop/no-unknown-returns -- scripted drizzle stub: tx is the drizzle transaction client stand-in, never parsed as domain data.
		transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
			state.transactionOpened = true;
			return fn({
				// oxlint-disable-next-line anti-slop/no-unknown-parameters -- scripted drizzle stub: the table token is captured verbatim for assertions.
				delete: (table: unknown) => {
					state.txDeleted.push(table);
					return { where: () => Promise.resolve() };
				},
				insert: () => ({
					values: (v: Row[]) => {
						state.txInsertValues = v;
						return { returning: () => Promise.resolve(state.txInsertReturn) };
					}
				})
			});
		}
	}
}));

import {
	createBill,
	getBillsForUser,
	updateBill,
	deleteBill,
	canMutateBill,
	normalizeBillCategory,
	normalizeAmountCents,
	normalizeBillItems,
	parseDueDate,
	parseRecurrence,
	computeNextBillDue,
	advanceBillCursor,
	setBillItems,
	getItemsForBills,
	type BillFrequency,
	type DueDateParse
} from './bills';
import type { Bill } from '$lib/server/db/schema';
import { BILL_CATEGORIES } from '$lib/server/db/schema';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();

/** Renders a captured drizzle orderBy argument to SQL text for assertions. */
function renderedSql(fragment: SQL): string {
	return dialect.sqlToQuery(fragment).sql;
}

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

beforeEach(() => {
	state.selectQueue = [];
	state.orderByArgs = [];
	state.insertValues = null;
	state.insertReturn = [];
	state.updateValues = null;
	state.updateReturn = [];
	state.deleteReturn = [];
	state.transactionOpened = false;
	state.txDeleted = [];
	state.txInsertValues = null;
	state.txInsertReturn = [];
});

describe('normalizeBillCategory', () => {
	const cases: [unknown, string][] = [
		['housing', 'housing'],
		['utilities', 'utilities'],
		['subscriptions', 'subscriptions'],
		['insurance', 'insurance'],
		['other', 'other'],
		['HOUSING', 'other'],
		['rent', 'other'],
		['', 'other'],
		[null, 'other'],
		[undefined, 'other'],
		[42, 'other']
	];
	for (const [raw, expected] of cases) {
		it(`maps ${JSON.stringify(raw)} to ${expected}`, () => {
			expect(normalizeBillCategory(raw)).toBe(expected);
		});
	}
});

describe('normalizeAmountCents', () => {
	const cases: [unknown, number | null][] = [
		[12.5, 1250],
		['12.50', 1250],
		[12000, 1200000],
		[0, 0],
		['0', 0],
		[-5, null],
		['-5', null],
		['abc', null],
		['', null],
		[null, null],
		[undefined, null],
		[Number.NaN, null],
		[1e308, null],
		['1e308', null],
		['1e10', null],
		[Number.MAX_SAFE_INTEGER, null],
		[21474836.47, 2147483647],
		[21474836.48, null]
	];
	for (const [raw, expected] of cases) {
		it(`maps ${JSON.stringify(raw)} to ${expected}`, () => {
			expect(normalizeAmountCents(raw)).toBe(expected);
		});
	}
});

describe('parseDueDate', () => {
	const cases: [unknown, DueDateParse][] = [
		[null, { status: 'ok', value: null }],
		['', { status: 'ok', value: null }],
		['   ', { status: 'ok', value: null }],
		['2026-09-15', { status: 'ok', value: '2026-09-15T00:00:00.000Z' }],
		['2026-09-15T10:30:00Z', { status: 'ok', value: '2026-09-15T10:30:00Z' }],
		['March 5, 2026', { status: 'ok', value: 'March 5, 2026' }],
		['not-a-date', { status: 'invalid' }],
		['2026-13-45', { status: 'invalid' }],
		[123, { status: 'invalid' }],
		[undefined, { status: 'invalid' }]
	];
	for (const [raw, expected] of cases) {
		it(`maps ${JSON.stringify(raw)} to ${JSON.stringify(expected)}`, () => {
			expect(parseDueDate(raw)).toEqual(expected);
		});
	}
});

describe('createBill', () => {
	it('inserts integer cents and returns the row', async () => {
		const row = bill();
		state.insertReturn = [row];

		const created = await createBill({
			title: 'Electric',
			amountCents: 12000,
			dueDate: '2026-09-15T00:00:00.000Z',
			category: 'utilities',
			userId: 'u1',
			familyId: 'f1'
		});

		expect(created).toEqual(row);
		expect(state.insertValues).toMatchObject({ title: 'Electric', amountCents: 12000 });
	});
});

describe('getBillsForUser', () => {
	it('returns family plus personal bills', async () => {
		state.selectQueue.push([bill(), bill({ id: 'bill-2', familyId: null })]);

		const rows = await getBillsForUser('u1', 'f1');

		expect(rows).toHaveLength(2);
	});

	it('orders soonest-due first, undated last, then by title', async () => {
		state.selectQueue.push([]);

		await getBillsForUser('u1', null);

		expect(state.orderByArgs).toHaveLength(2);
		expect(renderedSql(state.orderByArgs[0])).toContain('"bills"."due_date" asc nulls last');
		expect(renderedSql(state.orderByArgs[1])).toContain('"bills"."title" asc');
	});
});

describe('canMutateBill', () => {
	it('allows the owner regardless of role', () => {
		expect(canMutateBill(bill({ userId: 'u1' }), 'u1', 'member')).toBe(true);
		expect(canMutateBill(bill({ userId: 'u1' }), 'u1', null)).toBe(true);
	});

	it('allows creator and admin roles', () => {
		expect(canMutateBill(bill({ userId: 'u9' }), 'u1', 'creator')).toBe(true);
		expect(canMutateBill(bill({ userId: 'u9' }), 'u1', 'admin')).toBe(true);
	});

	it('denies plain members and strangers', () => {
		expect(canMutateBill(bill({ userId: 'u9' }), 'u1', 'member')).toBe(false);
		expect(canMutateBill(bill({ userId: 'u9' }), 'u1', null)).toBe(false);
		expect(canMutateBill(bill({ userId: 'u9' }), 'u1', 'superuser')).toBe(false);
	});
});

describe('updateBill', () => {
	it('writes the patch when permitted', async () => {
		state.selectQueue.push([bill()]);
		state.updateReturn = [bill({ title: 'Electric (new)' })];

		const updated = await updateBill('bill-1', 'u1', 'admin', { title: 'Electric (new)' });

		expect(updated?.title).toBe('Electric (new)');
		expect(state.updateValues).toMatchObject({ title: 'Electric (new)' });
	});

	it('writes nothing when forbidden', async () => {
		state.selectQueue.push([bill({ userId: 'u9' })]);

		const updated = await updateBill('bill-1', 'u1', 'member', { title: 'Hijacked' });

		expect(updated).toBeNull();
		expect(state.updateValues).toBeNull();
	});

	it('returns null for a missing bill', async () => {
		state.selectQueue.push([]);

		expect(await updateBill('nope', 'u1', 'admin', { title: 'x' })).toBeNull();
	});
});

describe('deleteBill', () => {
	it('deletes when permitted', async () => {
		state.selectQueue.push([bill()]);
		state.deleteReturn = [bill()];

		expect(await deleteBill('bill-1', 'u1', 'creator')).toBe(true);
	});

	it('deletes nothing when forbidden', async () => {
		state.selectQueue.push([bill({ userId: 'u9' })]);

		expect(await deleteBill('bill-1', 'u1', 'member')).toBe(false);
		expect(state.deleteReturn).toEqual([]);
	});
});

describe('normalizeBillItems (#031)', () => {
	it('accepts a valid item', () => {
		expect(
			normalizeBillItems([{ label: ' Whole Milk ', priceCents: 349, category: 'tax', name: 'x' }])
		).toEqual({
			items: [{ label: 'Whole Milk', priceCents: 349, category: 'tax', name: 'x' }]
		});
	});

	it('defaults category and name to null (inherit the bill category)', () => {
		expect(normalizeBillItems([{ label: 'Milk', priceCents: 349 }])).toEqual({
			items: [{ label: 'Milk', priceCents: 349, category: null, name: null }]
		});
	});

	it('accepts explicit null category (inherits) and int-string cents', () => {
		expect(normalizeBillItems([{ label: 'Milk', priceCents: '349', category: null }])).toEqual({
			items: [{ label: 'Milk', priceCents: 349, category: null, name: null }]
		});
	});

	it('accepts every vocabulary category and rejects unknown ones', () => {
		const good = BILL_CATEGORIES.map((category) => ({
			label: 'x',
			priceCents: 1,
			category
		}));
		expect(normalizeBillItems(good)).not.toHaveProperty('error');
		expect(normalizeBillItems([{ label: 'x', priceCents: 1, category: 'pets' }])).toEqual({
			error: 'Line item category must be one of the bill categories'
		});
	});

	const invalid: [string, unknown][] = [
		['non-array items', { label: 'x' }],
		['non-object item', ['x']],
		['missing label', [{ priceCents: 100 }]],
		['blank label', [{ label: '   ', priceCents: 100 }]],
		['non-string label', [{ label: 42, priceCents: 100 }]],
		['101-char label', [{ label: 'a'.repeat(101), priceCents: 100 }]],
		['missing price', [{ label: 'x' }]],
		['negative price', [{ label: 'x', priceCents: -1 }]],
		['fractional cents', [{ label: 'x', priceCents: 12.5 }]],
		['non-numeric price', [{ label: 'x', priceCents: 'lots' }]],
		['overflow price', [{ label: 'x', priceCents: 2147483648 }]],
		['non-string name', [{ label: 'x', priceCents: 1, name: 7 }]],
		['101-char name', [{ label: 'x', priceCents: 1, name: 'n'.repeat(101) }]],
		['51 items', Array.from({ length: 51 }, (_, i) => ({ label: `i${i}`, priceCents: 1 }))]
	];
	for (const [name, raw] of invalid) {
		it(`rejects ${name}`, () => {
			// Every invalid shape must land on the error branch with a message.
			expect(normalizeBillItems(raw)).toEqual({ error: expect.any(String) });
		});
	}

	it('accepts exactly 50 items', () => {
		const raw = Array.from({ length: 50 }, (_, i) => ({ label: `i${i}`, priceCents: 1 }));
		expect(normalizeBillItems(raw)).not.toHaveProperty('error');
	});
});

describe('setBillItems (#031 replace-all)', () => {
	it('opens one transaction, deletes old rows, inserts positioned new rows', async () => {
		state.txInsertReturn = [
			{ id: 'ri-1', billId: 'bill-1', label: 'Milk', priceCents: 349, category: null, position: 0 }
		];

		const rows = await setBillItems('bill-1', [
			{ label: 'Milk', priceCents: 349, category: null, name: null },
			{ label: 'Eggs', priceCents: 250, category: 'tax', name: null }
		]);

		expect(state.transactionOpened).toBe(true);
		expect(state.txDeleted).toHaveLength(1);
		expect(state.txInsertValues).toEqual([
			{ billId: 'bill-1', label: 'Milk', priceCents: 349, category: null, position: 0 },
			{ billId: 'bill-1', label: 'Eggs', priceCents: 250, category: 'tax', position: 1 }
		]);
		expect(rows).toHaveLength(1);
	});

	it('replaces with an empty list (clears all items)', async () => {
		const rows = await setBillItems('bill-1', []);

		expect(state.transactionOpened).toBe(true);
		expect(state.txDeleted).toHaveLength(1);
		expect(state.txInsertValues).toBeNull();
		expect(rows).toEqual([]);
	});
});

describe('getItemsForBills (#031)', () => {
	it('groups items by bill and orders the query by position', async () => {
		state.selectQueue.push([
			{ id: 'ri-1', billId: 'b2', label: 'A', priceCents: 1, category: null, position: 0 },
			{ id: 'ri-2', billId: 'b2', label: 'B', priceCents: 2, category: null, position: 1 },
			{ id: 'ri-3', billId: 'b1', label: 'C', priceCents: 3, category: null, position: 0 }
		]);

		const got = await getItemsForBills(['b1', 'b2']);

		expect([...got.keys()].sort()).toEqual(['b1', 'b2']);
		expect(got.get('b2')?.map((row) => row.label)).toEqual(['A', 'B']);
		expect(renderedSql(state.orderByArgs[0])).toContain('"receiptItems"."position" asc');
	});

	it('returns an empty map without issuing a query for no bills', async () => {
		const got = await getItemsForBills([]);

		expect(got.size).toBe(0);
		expect(state.selectQueue).toEqual([]);
	});
});

/* ── Recurring bills (#006) ─────────────────────────────────────────── */

describe('computeNextBillDue (bills cursor: due + n*interval, strictly after today)', () => {
	const paid = '2026-09-07T14:30:00.000Z';
	const cases: [string, string | null, BillFrequency, number, string][] = [
		// label, old dueDate, frequency, interval, expected next due
		[
			'monthly paid late within the period keeps the anchored cadence',
			'2026-09-01T00:00:00.000Z',
			'monthly',
			1,
			'2026-10-01T00:00:00.000Z'
		],
		[
			'paying a month late skips the missed period',
			'2026-08-01T00:00:00.000Z',
			'monthly',
			1,
			'2026-10-01T00:00:00.000Z'
		],
		[
			'early pay advances from the due date, not from today',
			'2026-10-01T00:00:00.000Z',
			'monthly',
			1,
			'2026-11-01T00:00:00.000Z'
		],
		[
			'paying on the due date moves exactly one interval',
			'2026-09-07T00:00:00.000Z',
			'monthly',
			1,
			'2026-10-07T00:00:00.000Z'
		],
		[
			'weekly lands on the next anchored weekday',
			'2026-09-01T00:00:00.000Z',
			'weekly',
			1,
			'2026-09-08T00:00:00.000Z'
		],
		[
			'biweekly (weekly x2) anchors on the stored due date',
			'2026-09-15T00:00:00.000Z',
			'weekly',
			2,
			'2026-09-29T00:00:00.000Z'
		],
		[
			'every_3_months (monthly x3) skips past today',
			'2026-06-01T00:00:00.000Z',
			'monthly',
			3,
			'2026-12-01T00:00:00.000Z'
		],
		[
			'yearly rolls to the next anniversary',
			'2026-01-15T00:00:00.000Z',
			'yearly',
			1,
			'2027-01-15T00:00:00.000Z'
		],
		['daily steps one day', '2026-09-07T00:00:00.000Z', 'daily', 1, '2026-09-08T00:00:00.000Z'],
		[
			'null cursor anchors the first occurrence one interval out',
			null,
			'monthly',
			1,
			'2026-10-07T00:00:00.000Z'
		]
	];
	for (const [label, due, frequency, interval, expected] of cases) {
		it(label, () => {
			expect(computeNextBillDue(due, frequency, interval, paid)).toBe(expected);
		});
	}
});

describe('parseRecurrence (#006)', () => {
	const okCases: [unknown, { frequency: string; interval: number } | null][] = [
		[null, null],
		[
			{ frequency: 'monthly', interval: 1 },
			{ frequency: 'monthly', interval: 1 }
		],
		[
			{ frequency: 'weekly', interval: 2 },
			{ frequency: 'weekly', interval: 2 }
		],
		[
			{ frequency: 'daily', interval: 3 },
			{ frequency: 'daily', interval: 3 }
		],
		[
			{ frequency: 'yearly', interval: 1 },
			{ frequency: 'yearly', interval: 1 }
		],
		[
			{ frequency: 'monthly', interval: 365 },
			{ frequency: 'monthly', interval: 365 }
		]
	];
	for (const [raw, expected] of okCases) {
		it(`accepts ${JSON.stringify(raw)}`, () => {
			expect(parseRecurrence(raw)).toEqual({ status: 'ok', value: expected });
		});
	}

	const badCases: [string, unknown][] = [
		['unknown frequency', { frequency: 'fortnightly', interval: 1 }],
		['parser token not in the stored vocabulary', { frequency: 'biweekly', interval: 1 }],
		['zero interval', { frequency: 'monthly', interval: 0 }],
		['negative interval', { frequency: 'monthly', interval: -1 }],
		['interval over 365', { frequency: 'monthly', interval: 366 }],
		['non-integer interval', { frequency: 'monthly', interval: 1.5 }],
		['missing interval', { frequency: 'monthly' }],
		['missing frequency', { interval: 1 }],
		['non-object raw', 'monthly'],
		['array raw', ['monthly', 1]]
	];
	for (const [label, raw] of badCases) {
		it(`rejects ${label}`, () => {
			expect(parseRecurrence(raw)).toEqual({ status: 'invalid' });
		});
	}
});

describe('advanceBillCursor (#006)', () => {
	it('advances a recurring bill from its OLD dueDate and returns the row', async () => {
		state.selectQueue.push([
			bill({ frequency: 'monthly', interval: 1, dueDate: '2026-08-01T00:00:00.000Z' })
		]);
		state.updateReturn = [
			bill({ frequency: 'monthly', interval: 1, dueDate: '2026-10-01T00:00:00.000Z' })
		];

		const advanced = await advanceBillCursor('bill-1', '2026-09-07T14:30:00.000Z');

		expect(state.updateValues).toEqual({ dueDate: '2026-10-01T00:00:00.000Z' });
		expect(advanced?.dueDate).toBe('2026-10-01T00:00:00.000Z');
	});

	it('leaves one-off bills (no frequency) untouched', async () => {
		state.selectQueue.push([bill()]);

		const advanced = await advanceBillCursor('bill-1', '2026-09-07T14:30:00.000Z');

		expect(advanced).toBeNull();
		expect(state.updateValues).toBeNull();
	});

	it('returns null for a missing bill', async () => {
		state.selectQueue.push([]);

		expect(await advanceBillCursor('nope', '2026-09-07T14:30:00.000Z')).toBeNull();
	});
});

describe('createBill recurrence passthrough (#006)', () => {
	it('stores frequency and interval on the new row', async () => {
		state.insertReturn = [bill({ frequency: 'monthly', interval: 1 })];

		await createBill({
			title: 'Rent',
			amountCents: 150000,
			dueDate: '2026-10-01T00:00:00.000Z',
			category: 'housing',
			userId: 'u1',
			familyId: null,
			frequency: 'monthly',
			interval: 1
		});

		expect(state.insertValues).toMatchObject({ frequency: 'monthly', interval: 1 });
	});
});
