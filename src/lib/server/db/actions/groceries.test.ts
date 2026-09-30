import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Store colour writes (096). The colour is dual-scoped exactly like Store
 * Memory: a personal row (familyId null) plus a family row, personal winning
 * on read. This stubs the drizzle builder so the SCOPE of the write — the
 * load-bearing decision — is verified without a live database. Same
 * boundary-stubbing pattern as familyTaskSeam.test.ts.
 */
type Row = Record<string, string | number | boolean | null>;

interface StubState {
	queue: Row[][];
	inserted: Row | null;
	conflictSet: Row | null;
	deleted: number;
}

const state = vi.hoisted(
	(): StubState => ({
		queue: [],
		inserted: null,
		conflictSet: null,
		deleted: 0
	})
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(state.queue.shift() ?? [])
			})
		}),
		insert: () => ({
			values: (values: Row) => {
				state.inserted = values;
				return {
					onConflictDoUpdate: (config: { set: Row }) => {
						state.conflictSet = config.set;
						return Promise.resolve();
					}
				};
			}
		}),
		delete: () => ({
			where: () => {
				state.deleted++;
				return Promise.resolve();
			}
		})
	}
}));

import { setStoreColour, getStoreColours } from './groceries';
import { defaultStoreColourKey, isStoreColourKey } from '$lib/data/groceries';

const viewer = { userId: 'u1', familyId: 'fam1' };

beforeEach(() => {
	state.queue = [];
	state.inserted = null;
	state.conflictSet = null;
	state.deleted = 0;
});

describe('setStoreColour', () => {
	it('writes a personal row (familyId null) for the personal scope', async () => {
		await setStoreColour(viewer, { scope: 'personal', store: 'Aldi', color: 'sky' });
		expect(state.inserted).toMatchObject({
			userId: 'u1',
			familyId: null,
			storeKey: 'aldi',
			color: 'sky'
		});
	});

	it('writes a family row for the family scope', async () => {
		await setStoreColour(viewer, { scope: 'family', store: 'Aldi', color: 'sage' });
		expect(state.inserted).toMatchObject({ userId: 'u1', familyId: 'fam1', storeKey: 'aldi' });
	});

	it('refuses the family scope when the user has no family', async () => {
		expect(
			await setStoreColour(
				{ userId: 'u1', familyId: null },
				{ scope: 'family', store: 'Aldi', color: 'sky' }
			)
		).toBe(false);
		expect(state.inserted).toBeNull();
	});

	it('keys on the trimmed lowercased store name, never the display string', async () => {
		await setStoreColour(viewer, { scope: 'personal', store: '  Trader Joe’s ', color: 'sky' });
		expect(state.inserted?.storeKey).toBe('trader joe’s');
	});

	it('rejects a colour outside the declared palette', async () => {
		expect(
			await setStoreColour(viewer, { scope: 'personal', store: 'Aldi', color: '#ff0000' })
		).toBe(false);
		expect(state.inserted).toBeNull();
	});

	it('accepts every declared swatch', async () => {
		for (const key of ['terracotta', 'sky', 'sage', 'lilac', 'amber', 'slate']) {
			expect(await setStoreColour(viewer, { scope: 'personal', store: 'Aldi', color: key })).toBe(
				true
			);
		}
	});

	it('clears the row when the colour is "auto", so the name default returns', async () => {
		expect(await setStoreColour(viewer, { scope: 'personal', store: 'Aldi', color: 'auto' })).toBe(
			true
		);
		expect(state.deleted).toBe(1);
		expect(state.inserted).toBeNull();
	});

	it('refuses to clear the no-store group — it has no colour to carry', async () => {
		expect(
			await setStoreColour(viewer, { scope: 'personal', store: 'Any store', color: 'sky' })
		).toBe(false);
	});

	it('refuses a blank store name', async () => {
		expect(await setStoreColour(viewer, { scope: 'personal', store: '   ', color: 'sky' })).toBe(
			false
		);
	});
});

describe('getStoreColours', () => {
	it('returns personal + family rows for the viewer, keyed by store', async () => {
		state.queue = [
			[
				{ storeKey: 'aldi', color: 'sky', userId: 'u1', familyId: null },
				{ storeKey: 'aldi', color: 'sage', userId: 'u1', familyId: 'fam1' }
			]
		];
		expect(await getStoreColours(viewer)).toHaveLength(2);
	});

	it('returns an empty list when the viewer has set no colours', async () => {
		expect(await getStoreColours(viewer)).toEqual([]);
	});
});

describe('the default a cleared store falls back to', () => {
	it('is a declared swatch derived from the name', () => {
		expect(isStoreColourKey(defaultStoreColourKey('Aldi'))).toBe(true);
		expect(defaultStoreColourKey('  ALDI ')).toBe(defaultStoreColourKey('Aldi'));
	});
});
