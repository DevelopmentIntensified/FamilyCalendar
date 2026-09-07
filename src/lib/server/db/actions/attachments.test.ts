import { describe, it, expect, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';

/**
 * Attachment action tests. The drizzle query-builder is scripted (same
 * pattern as bills.test.ts); permission predicates are pure. Justified
 * mock: see docs/issues/002.
 */
type Row = Record<string, string | number | boolean | null | Date>;

/** Drizzle transaction callback type (production db, pre-mock). */
type Db = typeof import('$lib/server/db');
type Txn = Parameters<Parameters<Db['db']['transaction']>[0]>[0];

interface StubState {
	selectQueue: Row[][];
	insertReturn: Row[];
	/** Values captured from the two updates inside deleteAttachment's transaction. */
	txUpdateValues: Row[] | null;
	txUpdateWhereArgs: SQL[];
	deleteReturn: Row[];
	/** Captured where-args of the top-level (non-tx) select. */
	lastSelectWhereArgs: SQL[];
}

const state = vi.hoisted(
	(): StubState => ({
		selectQueue: [],
		insertReturn: [],
		txUpdateValues: null,
		txUpdateWhereArgs: [],
		deleteReturn: [],
		lastSelectWhereArgs: []
	})
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		transaction: (fn: (tx: Txn) => Promise<boolean>) =>
			fn(
				// SAFETY: scripted stub never issues SQL; the fake tx only records
				// captured set()/where() calls for assertions.
				// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- test double: the fake tx is structurally unrelated to drizzle's transaction type by design.
				{
					update: () => ({
						set: (v: Row) => {
							state.txUpdateValues = [v];
							return {
								where: (...args: SQL[]) => {
									state.txUpdateWhereArgs = args;
									return Promise.resolve();
								}
							};
						}
					}),
					delete: () => ({
						where: () => ({
							returning: () => Promise.resolve(state.deleteReturn)
						})
					})
				} as unknown as Txn
			),
		select: () => ({
			from: () => ({
				// Awaitable directly (inArray select) and via .limit() (getAttachment).
				// The await path shifts lazily (microtask) so .limit() consumers
				// aren't pre-empted.
				where: (...args: SQL[]) => {
					state.lastSelectWhereArgs = args;
					const direct = new Promise<Row[]>((resolve) =>
						queueMicrotask(() => resolve(state.selectQueue.shift() ?? []))
					);
					return Object.assign(direct, {
						limit: () => Promise.resolve(state.selectQueue.shift() ?? [])
					});
				}
			})
		}),
		insert: () => ({
			values: () => ({
				returning: () => Promise.resolve(state.insertReturn)
			})
		})
	}
}));

import {
	buildReceiptsByBillId,
	createAttachment,
	getAttachment,
	getAttachmentsByIds,
	canManageAttachment,
	canLinkAttachment,
	deleteAttachment
} from './attachments';
import type { Attachment } from '$lib/server/db/schema';

function attachmentFixture(over: Partial<Attachment> = {}): Attachment {
	return {
		id: 'att-1',
		ownerUserId: 'u1',
		familyId: 'f1',
		url: 'https://blob.example/receipts/a.jpg',
		filename: 'family-master/receipts/a.jpg',
		mimeType: 'image/jpeg',
		sizeBytes: 1000,
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

describe('canManageAttachment (pure)', () => {
	it.each([
		['owner of a personal attachment', 'u1', null, true],
		['owner inside a family', 'u1', 'admin', true],
		['family admin, not the owner', 'u2', 'creator', true],
		['family creator, not the owner', 'u2', 'admin', true],
		['plain family member', 'u2', 'member', false],
		['stranger with no role', 'u3', null, false]
	])('%s', (_name, userId, role, expected) => {
		expect(canManageAttachment(attachmentFixture(), userId, role)).toBe(expected);
	});
});

describe('canLinkAttachment (pure)', () => {
	it.each([
		['own attachment, no family', 'u1', null, true],
		['own attachment inside family', 'u1', 'f1', true],
		['family receipt for a member of that family', 'u2', 'f1', true],
		['family receipt for a user without a family', 'u2', null, false],
		['another family’s receipt', 'u2', 'f2', false],
		['stranger’s personal receipt', 'u3', null, false]
	])('%s', (_name, userId, familyId, expected) => {
		expect(canLinkAttachment(attachmentFixture(), userId, familyId)).toBe(expected);
	});
});

describe('buildReceiptsByBillId (pure)', () => {
	const bills = [
		{ id: 'b1', attachmentId: 'att-1' },
		{ id: 'b2', attachmentId: 'gone' },
		{ id: 'b3', attachmentId: null }
	];

	it('maps only bills whose attachment row exists', () => {
		const map = buildReceiptsByBillId(bills, [attachmentFixture()]);
		expect(map).toEqual({
			b1: {
				id: 'att-1',
				url: 'https://blob.example/receipts/a.jpg',
				filename: 'family-master/receipts/a.jpg',
				mimeType: 'image/jpeg'
			}
		});
	});

	it('returns {} with no attachments', () => {
		expect(buildReceiptsByBillId(bills, [])).toEqual({});
	});
});

describe('getAttachmentsByIds', () => {
	it('returns attachments for the given bill ids', async () => {
		state.selectQueue = [[attachmentFixture()]];
		const rows = await getAttachmentsByIds(['att-1']);
		expect(rows).toHaveLength(1);
		expect(state.lastSelectWhereArgs.length).toBeGreaterThan(0);
	});

	it('returns [] for an empty id list without querying', async () => {
		state.selectQueue = [];
		const rows = await getAttachmentsByIds([]);
		expect(rows).toEqual([]);
	});
});

describe('createAttachment', () => {
	it('inserts the row and returns it', async () => {
		state.insertReturn = [attachmentFixture()];
		const created = await createAttachment({
			ownerUserId: 'u1',
			familyId: 'f1',
			url: 'https://blob.example/receipts/a.jpg',
			filename: 'family-master/receipts/a.jpg',
			mimeType: 'image/jpeg',
			sizeBytes: 1000
		});
		expect(created).toMatchObject({ id: 'att-1', mimeType: 'image/jpeg' });
	});
});

describe('getAttachment', () => {
	it('returns the row when found', async () => {
		state.selectQueue = [[attachmentFixture()]];
		expect(await getAttachment('att-1')).toMatchObject({ id: 'att-1' });
	});

	it('returns undefined when not found', async () => {
		state.selectQueue = [[]];
		expect(await getAttachment('nope')).toBeUndefined();
	});
});

describe('deleteAttachment', () => {
	it('runs in one transaction: detaches bills then deletes the row', async () => {
		state.deleteReturn = [{ id: 'att-1' }];
		const removed = await deleteAttachment('att-1');
		expect(removed).toBe(true);
		expect(state.txUpdateValues).toEqual([{ attachmentId: null }]);
		expect(state.txUpdateWhereArgs.length).toBeGreaterThan(0);
	});

	it('returns false when nothing was deleted', async () => {
		state.deleteReturn = [];
		expect(await deleteAttachment('att-1')).toBe(false);
	});
});
