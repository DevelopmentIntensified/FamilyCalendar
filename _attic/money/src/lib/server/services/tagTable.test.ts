import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ItemTag } from '$lib/server/db/schema';

/**
 * Tag Table service tests (issue 031). The drizzle db is scripted (same
 * pattern as events.test.ts): select results are queued in call order,
 * transaction/insert calls are captured, and prediction/training query
 * shapes are pinned (2-query batched lookup, single-transaction upserts).
 */
/** A stubbed itemTags row: plain JSON-ish values only. */
function tagRow(over: Partial<ItemTag> = {}): ItemTag {
	return {
		id: 'tag-1',
		userId: 'u1',
		key: 'milk',
		// SAFETY: the stub only feeds the prediction/aggregation logic, which
		// treats category as an opaque string; a non-vocabulary literal keeps
		// the fixtures independent of the closed-vocabulary list.
		category: 'groceries-not-a-category' as ItemTag['category'],
		name: null,
		weight: 1,
		updatedAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

// oxlint-disable anti-slop/no-unsafe-dictionary-type,anti-slop/no-unknown-parameters,anti-slop/no-unknown-returns -- scripted capture bag over drizzle call shapes; stub payloads and callback shapes are never parsed as domain data.

interface CapturedInsert {
	table: unknown;
	values: Array<Record<string, unknown>>;
	conflict: Record<string, unknown> | null;
}

interface StubState {
	// Rows returned by db.select().from().where(), in call order.
	selectQueue: ItemTag[][];
	selectCalls: number;
	transactionOpened: boolean;
	inserts: CapturedInsert[];
}

const state = vi.hoisted(
	(): StubState => ({
		selectQueue: [],
		selectCalls: 0,
		transactionOpened: false,
		inserts: []
	})
);

const txStub = vi.hoisted(() => ({
	insert: (table: unknown) => ({
		values: (values: Array<Record<string, unknown>>) => {
			const captured: CapturedInsert = { table, values, conflict: null };
			state.inserts.push(captured);
			return {
				onConflictDoUpdate: (conflict: Record<string, unknown>) => {
					captured.conflict = conflict;
					return Promise.resolve();
				}
			};
		}
	})
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				// Thenable + chainable: predictCategory awaits where() directly,
				// topTags chains .orderBy().limit() off it. A custom thenable
				// (not a resolved promise) so the queue only shifts once per query.
				where: () => {
					const take = () => {
						state.selectCalls += 1;
						return state.selectQueue.shift() ?? [];
					};
					return {
						// SAFETY: the stub must stand in for drizzle's awaitable query
						// builder, which is thenable by contract — the thenable shape
						// is the pinned API, not a sneaky promise.
						// oxlint-disable-next-line unicorn/no-thenable
						then: (onFulfilled: (v: ItemTag[]) => unknown, onRejected?: (e: unknown) => unknown) =>
							Promise.resolve(take()).then(onFulfilled, onRejected),
						orderBy: () => ({
							limit: async () => take()
						})
					};
				}
			})
		}),
		transaction: async (fn: (tx: typeof txStub) => Promise<unknown>) => {
			state.transactionOpened = true;
			return fn(txStub);
		}
	}
}));

import {
	normalizeTagKey,
	isBareCodeLabel,
	deriveItemKey,
	predictCategory,
	trainTagTable,
	topTags,
	MAX_TAG_KEY_LENGTH
} from './tagTable';

/** Extracts drizzle column names from a captured onConflict target. */
function conflictTarget(captured: CapturedInsert): string[] {
	// SAFETY: the stub captures the raw onConflictDoUpdate config verbatim;
	// its target is always drizzle column objects (or undefined), so the
	// assertion only reads the column-name evidence those objects carry.
	const target = captured.conflict?.target as Array<{ name: string }> | undefined;
	return Array.isArray(target) ? target.map((col) => col.name) : [];
}

beforeEach(() => {
	state.selectQueue = [];
	state.selectCalls = 0;
	state.transactionOpened = false;
	state.inserts = [];
});

describe('normalizeTagKey', () => {
	const cases: [string, string][] = [
		['Milk', 'milk'],
		['  Whole Milk  ', 'whole milk'],
		['Kroger 2% Milk', 'kroger 2 milk'],
		['Joe & Joe`s Coffee!', 'joe joe s coffee'],
		['ACME, Inc.', 'acme inc'],
		['big-box   store', 'big box store'],
		['store #1234', 'store 1234'],
		['Café	René', 'café rené'],
		['', ''],
		['!!!', '']
	];
	for (const [raw, expected] of cases) {
		it(`normalizes ${JSON.stringify(raw)} to ${JSON.stringify(expected)}`, () => {
			expect(normalizeTagKey(raw)).toBe(expected);
		});
	}

	it('is idempotent', () => {
		const once = normalizeTagKey('Joe & Joe`s Coffee!');
		expect(normalizeTagKey(once)).toBe(once);
	});

	it('caps key length so hostile labels cannot bloat the index', () => {
		const long = 'a'.repeat(500);
		expect(normalizeTagKey(long).length).toBeLessThanOrEqual(MAX_TAG_KEY_LENGTH);
	});
});

describe('isBareCodeLabel', () => {
	const cases: [string, boolean][] = [
		['4011', true],
		[' 8901234567890 ', true],
		['012345678905', true],
		['12', false],
		['4011a', false],
		['item 4011', false],
		['4.011', false],
		['', false]
	];
	for (const [label, expected] of cases) {
		it(`maps ${JSON.stringify(label)} to ${expected}`, () => {
			expect(isBareCodeLabel(label)).toBe(expected);
		});
	}
});

describe('deriveItemKey', () => {
	const cases: [string, string, string][] = [
		// Plain labels normalize to themselves.
		['Kroger', 'Whole Milk', 'whole milk'],
		// Store SKUs are merchant-scoped: (merchant, code).
		['Kroger', '4011', 'kroger 4011'],
		['ACME, Inc.', ' 8901234567890 ', 'acme inc 8901234567890'],
		// Derived keys are normalizeTagKey-stable (idempotent).
		['Kroger', '4011', 'kroger 4011']
	];
	for (const [merchant, label, expected] of cases) {
		it(`derives ${JSON.stringify([merchant, label])} to ${JSON.stringify(expected)}`, () => {
			const key = deriveItemKey(merchant, label);
			expect(key).toBe(expected);
			expect(normalizeTagKey(key)).toBe(key);
		});
	}
});

describe('predictCategory', () => {
	it('returns null for keys with no rows', async () => {
		state.selectQueue.push([], []);

		const got = await predictCategory({ merchant: 'Kroger', itemKeys: ['Milk'] }, 'u1');

		expect(got.merchant).toBeNull();
		expect(got.items['milk']).toBeNull();
	});

	it('prefers the user row over a heavier global row', async () => {
		state.selectQueue.push(
			[tagRow({ key: 'milk', category: 'utilities', weight: 1 })],
			[tagRow({ userId: null, key: 'milk', category: 'housing', weight: 99 })]
		);

		const got = await predictCategory({ merchant: null, itemKeys: ['Milk'] }, 'u1');

		expect(got.items['milk']).toEqual({ category: 'utilities', source: 'user', name: null });
	});

	it('falls back to the global majority (highest weight)', async () => {
		state.selectQueue.push(
			[],
			[
				tagRow({ userId: null, key: 'milk', category: 'utilities', weight: 9 }),
				tagRow({ userId: null, key: 'milk', category: 'housing', weight: 5 })
			]
		);

		const got = await predictCategory({ merchant: null, itemKeys: ['Milk'] }, 'u1');

		expect(got.items['milk']).toEqual({ category: 'utilities', source: 'global', name: null });
	});

	it('predicts the merchant from its own key', async () => {
		state.selectQueue.push([tagRow({ key: 'kroger', category: 'other', weight: 4 })], []);

		const got = await predictCategory({ merchant: 'Kroger!', itemKeys: [] }, 'u1');

		expect(got.merchant).toEqual({ category: 'other', source: 'user', name: null });
	});

	it('derives (merchant, sku) keys for bare-code items', async () => {
		state.selectQueue.push(
			[],
			[
				tagRow({
					userId: null,
					key: 'kroger 4011',
					category: 'utilities',
					weight: 3,
					name: 'Banana'
				})
			]
		);

		const got = await predictCategory({ merchant: 'Kroger', itemKeys: ['4011'] }, 'u1');

		expect(got.items['kroger 4011']).toEqual({
			category: 'utilities',
			source: 'global',
			name: 'Banana'
		});
	});

	it('uses exactly 2 queries and stays under the 50ms budget at 1000 rows', async () => {
		// Seed 1000 rows: 400 user rows + 600 global rows across 100 keys.
		const userRows = Array.from({ length: 400 }, (_, i) =>
			tagRow({ key: `item ${i % 100}`, category: 'utilities', weight: (i % 7) + 1 })
		);
		const globalRows = Array.from({ length: 600 }, (_, i) =>
			tagRow({
				userId: null,
				key: `item ${i % 100}`,
				category: 'fees',
				weight: (i % 11) + 1
			})
		);
		state.selectQueue.push(userRows, globalRows);
		const itemKeys = Array.from({ length: 100 }, (_, i) => `Item ${i}!`);

		const start = performance.now();
		const got = await predictCategory({ merchant: 'Kroger', itemKeys }, 'u1');
		const elapsed = performance.now() - start;

		expect(state.selectCalls).toBe(2);
		// Every key answered: user rows (weight ≥1) beat the global 'fees'.
		for (let i = 0; i < 100; i += 1) {
			expect(got.items[`item ${i}`]?.category).toBe('utilities');
			expect(got.items[`item ${i}`]?.source).toBe('user');
		}
		expect(elapsed).toBeLessThan(50);
	});
});

describe('trainTagTable', () => {
	it('opens a single transaction and upserts user + global rows', async () => {
		await trainTagTable('u1', 'Kroger', 'utilities', [
			{ key: 'Whole Milk', category: 'utilities' }
		]);

		expect(state.transactionOpened).toBe(true);
		expect(state.inserts).toHaveLength(2);
		// First insert: user-scoped rows (merchant + item) with userId set.
		expect(state.inserts[0].values).toEqual([
			{ userId: 'u1', key: 'kroger', category: 'utilities', name: null },
			{ userId: 'u1', key: 'whole milk', category: 'utilities', name: null }
		]);
		expect(conflictTarget(state.inserts[0])).toEqual(['userId', 'key', 'category']);
		// Second insert: global rows (same keys, userId null).
		expect(state.inserts[1].values).toEqual([
			{ userId: null, key: 'kroger', category: 'utilities', name: null },
			{ userId: null, key: 'whole milk', category: 'utilities', name: null }
		]);
		expect(conflictTarget(state.inserts[1])).toEqual(['key', 'category']);
	});

	it('normalizes keys identically to prediction and keeps learned names', async () => {
		await trainTagTable('u1', 'ACME, Inc.', 'fees', [
			{ key: '4011', category: 'utilities', name: 'Banana' }
		]);

		expect(state.inserts[0].values).toEqual([
			{ userId: 'u1', key: 'acme inc', category: 'fees', name: null },
			{ userId: 'u1', key: 'acme inc 4011', category: 'utilities', name: 'Banana' }
		]);
		// Weight upserts increment; names only fill in, never blank out.
		expect(conflictTarget(state.inserts[0])).toEqual(['userId', 'key', 'category']);
	});

	it('dedupes repeated keys in one batch, keeping the last category', async () => {
		await trainTagTable('u1', 'Kroger', 'other', [
			{ key: 'Milk', category: 'utilities' },
			{ key: '  milk ', category: 'housing' }
		]);

		const itemRows = state.inserts[0].values.filter((v) => v.key === 'milk');
		expect(itemRows).toEqual([{ userId: 'u1', key: 'milk', category: 'housing', name: null }]);
	});

	it('still trains "other" categories (popularity data)', async () => {
		await trainTagTable('u1', 'Corner Shop', 'other', [
			{ key: 'Mystery Gadget', category: 'other' }
		]);

		expect(state.inserts[0].values).toContainEqual({
			userId: 'u1',
			key: 'mystery gadget',
			category: 'other',
			name: null
		});
	});

	it('trains nothing when there are no items', async () => {
		await trainTagTable('u1', 'Kroger', 'utilities', []);

		expect(state.transactionOpened).toBe(false);
		expect(state.inserts).toHaveLength(0);
	});
});

describe('topTags', () => {
	it('returns the user top list and the global top list in 2 queries', async () => {
		const userTop = [tagRow({ key: 'milk', category: 'utilities', weight: 12 })];
		const globalTop = [tagRow({ userId: null, key: 'bananas', category: 'utilities', weight: 99 })];
		state.selectQueue.push(userTop, globalTop);

		const got = await topTags('u1', 50);

		expect(state.selectCalls).toBe(2);
		expect(got.user).toEqual(userTop);
		expect(got.global).toEqual(globalTop);
	});
});
