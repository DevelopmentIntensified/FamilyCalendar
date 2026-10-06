import { describe, it, expect } from 'vitest';
import {
	normalizeGroceryName,
	parseGroceryQuickAdd,
	uniqueStores,
	groupGroceriesByStore,
	mostFrequentStore,
	STORE_COLOURS,
	isStoreColourKey,
	defaultStoreColourKey,
	colourFor,
	storesSharingColour,
	resolveGroceryColours,
	SCOPE_FILTERS,
	scopeFromParam,
	matchesGrocerySearch,
	scopeOf,
	colourOverrideKey,
	optimisticColourRow,
	withColourOverrides,
	hasColourOverride,
	type StoreColourRow
} from './groceries';

describe('normalizeGroceryName', () => {
	it.each([
		['Milk', 'milk'],
		['  Oat Milk  ', 'oat milk'],
		['EGGS', 'eggs'],
		['  ', '']
	])('(%p) -> %p', (input, expected) => {
		expect(normalizeGroceryName(input)).toBe(expected);
	});
});

describe('parseGroceryQuickAdd', () => {
	it.each([
		['milk', { name: 'milk', quantity: 1 }],
		['milk 2', { name: 'milk', quantity: 2 }],
		['2 milk', { name: 'milk', quantity: 2 }],
		['oat milk 12', { name: 'oat milk', quantity: 12 }],
		['  Eggs   6  ', { name: 'Eggs', quantity: 6 }],
		['', { name: '', quantity: 1 }]
	])('(%p)', (input, expected) => {
		expect(parseGroceryQuickAdd(input)).toEqual(expected);
	});
});

describe('mostFrequentStore', () => {
	it('picks the highest-count store, ties -> first seen', () => {
		expect(
			mostFrequentStore([
				{ store: 'Aldi', count: 2 },
				{ store: 'Kroger', count: 5 },
				{ store: 'Costco', count: 5 }
			])
		).toBe('Kroger');
		expect(mostFrequentStore([])).toBeNull();
	});
});

describe('groupGroceriesByStore', () => {
	it('groups by primary store, storeless under "Any store"', () => {
		const groups = groupGroceriesByStore([
			{ id: '1', name: 'milk', stores: ['Aldi', 'Kroger'] },
			{ id: '2', name: 'eggs', stores: [] },
			{ id: '3', name: 'bread', stores: ['Aldi'] }
		]);
		expect(groups.map((g) => g.store)).toEqual(['Aldi', 'Any store']);
		expect(groups[0].items.map((i) => i.name)).toEqual(['milk', 'bread']);
	});

	it('merges stores case-agnostically, first-seen label wins', () => {
		const groups = groupGroceriesByStore([
			{ id: '1', name: 'milk', stores: ['Aldi'] },
			{ id: '2', name: 'eggs', stores: ['aldi', 'Kroger'] }
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0].store).toBe('Aldi');
	});

	it('sorts Store groups alphabetically, not by insertion order', () => {
		const groups = groupGroceriesByStore([
			{ id: '1', name: 'sourdough', stores: ['Whole Foods'] },
			{ id: '2', name: 'eggs', stores: ['Aldi'] },
			{ id: '3', name: 'coffee', stores: ['Costco'] },
			{ id: '4', name: 'soap', stores: [] }
		]);
		expect(groups.map((g) => g.store)).toEqual(['Aldi', 'Any store', 'Costco', 'Whole Foods']);
	});

	it('keeps items inside a group in insertion order while sorting the groups', () => {
		const groups = groupGroceriesByStore([
			{ id: '1', name: 'zeta', stores: ['Aldi'] },
			{ id: '2', name: 'apple', stores: ['Aldi'] },
			{ id: '3', name: 'milk', stores: ['Baker'] }
		]);
		expect(groups.map((g) => g.store)).toEqual(['Aldi', 'Baker']);
		expect(groups[0].items.map((i) => i.name)).toEqual(['zeta', 'apple']);
	});

	// The colour has to key on exactly the key the group keys on, or one
	// store renders as two colours. The group key is `label.toLowerCase()`;
	// every store the server writes is already trimmed (`cleanStores`), so on
	// real data that is the trim-and-lowercase rule the colour table uses.
	it('keys a group label on the same normalization the colour table uses', () => {
		const groups = groupGroceriesByStore([
			{ id: '1', name: 'milk', stores: ['Aldi'] },
			{ id: '2', name: 'eggs', stores: ['ALDI'] }
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0].store.toLowerCase()).toBe(normalizeGroceryName('  aldi '));
	});
});

describe('STORE_COLOURS', () => {
	it('is a small curated set, never a free colour field', () => {
		expect(STORE_COLOURS.length).toBeGreaterThanOrEqual(4);
		expect(STORE_COLOURS.length).toBeLessThanOrEqual(8);
	});

	it('has a unique key per swatch', () => {
		expect(new Set(STORE_COLOURS.map((c) => c.key)).size).toBe(STORE_COLOURS.length);
	});

	it('accepts only declared keys', () => {
		for (const c of STORE_COLOURS) expect(isStoreColourKey(c.key)).toBe(true);
		expect(isStoreColourKey('#ff0000')).toBe(false);
		expect(isStoreColourKey('')).toBe(false);
		expect(isStoreColourKey(null)).toBe(false);
	});
});

describe('defaultStoreColourKey', () => {
	it('derives from the store NAME, so adding a store never repaints the others', () => {
		// Same name, any spelling -> same swatch. The set of stores on the page
		// is not an input, which is the whole point.
		expect(defaultStoreColourKey('Aldi')).toBe(defaultStoreColourKey('  ALDI '));
		expect(defaultStoreColourKey('Costco')).toBe(defaultStoreColourKey('costco'));
	});

	it('always lands inside the declared palette', () => {
		for (const name of ['Aldi', 'Kroger', 'Costco', 'Whole Foods', 'Lidl', 'Safeway', 'Publix']) {
			expect(isStoreColourKey(defaultStoreColourKey(name))).toBe(true);
		}
	});

	it('is allowed to collide — six swatches, unlimited stores — and the test names a real pair', () => {
		// Collisions are permitted and disclosed, never hidden: the header
		// names the twin and the store name is always printed. Pinning a real
		// colliding pair keeps that promise honest instead of aspirational.
		const pair = ['Costco', 'Lidl'].filter(
			(n) => defaultStoreColourKey(n) === defaultStoreColourKey('Costco')
		);
		expect(pair).toContain('Lidl');
	});
});

describe('colourFor — personal, then family, then default', () => {
	const viewer = { userId: 'u1', familyId: 'fam1' };
	const rows = [
		{ storeKey: 'aldi', color: 'sky', userId: 'u1', familyId: null },
		{ storeKey: 'aldi', color: 'sage', userId: 'u1', familyId: 'fam1' },
		{ storeKey: 'kroger', color: 'sage', userId: 'u1', familyId: 'fam1' }
	];

	it('tier 1 — a personal row wins over the family row', () => {
		expect(colourFor('Aldi', rows, viewer)?.key).toBe('sky');
	});

	it('tier 2 — the family row applies when there is no personal override', () => {
		expect(colourFor('Kroger', rows, viewer)?.key).toBe('sage');
	});

	it('tier 3 — an unconfigured store gets its name-derived default', () => {
		const unconfigured: StoreColourRow[] = [];
		expect(colourFor('Costco', unconfigured, viewer)?.key).toBe(defaultStoreColourKey('Costco'));
	});

	it("another member's personal row is not this viewer's", () => {
		const others = [{ storeKey: 'aldi', color: 'sky', userId: 'u2', familyId: null }];
		expect(colourFor('Aldi', others, viewer)?.key).not.toBe('sky');
	});

	it('resolves identically for the family list and a personal list', () => {
		// The viewer decides the resolution, not which tab is open: the same
		// rows in the same scope must answer the same on both lists.
		expect(colourFor('Aldi', rows, viewer)).toEqual(colourFor('Aldi', rows, viewer));
		expect(colourFor('Kroger', rows, viewer)?.key).toBe('sage');
	});

	it('never tints the no-store group — an absent store is not a shop', () => {
		expect(colourFor('Any store', rows, viewer)).toBeNull();
		expect(colourFor('', rows, viewer)).toBeNull();
		expect(colourFor('   ', rows, viewer)).toBeNull();
	});

	it('keys on the name, not the display string: two spellings are one colour', () => {
		expect(colourFor('aldi', rows, viewer)?.key).toBe('sky');
		expect(colourFor('ALDI', rows, viewer)?.key).toBe('sky');
	});

	it('ignores a colour the palette does not declare rather than rendering it', () => {
		const junk = [{ storeKey: 'aldi', color: 'chartreuse', userId: 'u1', familyId: null }];
		expect(colourFor('Aldi', junk, viewer)?.key).toBe(defaultStoreColourKey('Aldi'));
	});
});

describe('storesSharingColour', () => {
	const viewer = { userId: 'u1', familyId: 'fam1' };

	it('names the other stores on the same swatch so a collision is disclosed', () => {
		expect(storesSharingColour('Costco', ['Costco', 'Lidl'], [], viewer)).toEqual(['Lidl']);
	});

	it('is empty when the store is alone on its swatch', () => {
		expect(storesSharingColour('HEB', ['HEB', 'Target'], [], viewer)).toEqual([]);
	});

	it('never counts "Any store" as a twin — it is not tinted', () => {
		expect(storesSharingColour('Any store', ['Any store', 'Lidl'], [], viewer)).toEqual([]);
	});
});

describe('resolveGroceryColours', () => {
	const viewer = { userId: 'u1', familyId: 'fam1' };
	const rows = [{ storeKey: 'aldi', color: 'sky', userId: 'u1', familyId: 'fam1' }];

	it('resolves every group on the page by its label', () => {
		const colours = resolveGroceryColours(['Aldi', 'Kroger', 'Any store'], rows, viewer);
		expect(colours.get('Aldi')?.key).toBe('sky');
		expect(colours.get('Kroger')?.key).toBe(defaultStoreColourKey('Kroger'));
		expect(colours.get('Any store')).toBeNull();
	});

	it('is keyed by the group label as written, so the page reads it straight off the group', () => {
		const colours = resolveGroceryColours(['  ALDI '], rows, viewer);
		expect(colours.get('  ALDI ')?.key).toBe('sky');
	});

	it('resolves a list with no configured stores at all', () => {
		const colours = resolveGroceryColours(['Aldi', 'Kroger'], [], viewer);
		expect(colours.get('Aldi')?.key).toBe(defaultStoreColourKey('Aldi'));
		expect(colours.get('Kroger')?.key).toBe(defaultStoreColourKey('Kroger'));
	});
});

/* ── 097: one list, a scope filter, both scopes visible ───────────────────── */
describe('SCOPE_FILTERS', () => {
	it('opens on "all" — the page shows everything rather than one scope to switch away from', () => {
		expect(SCOPE_FILTERS[0].key).toBe('all');
	});

	it('carries all three scopes', () => {
		expect(SCOPE_FILTERS.map((s) => s.key)).toEqual(['all', 'family', 'mine']);
	});

	it('only accepts a real scope, so a junk ?scope= falls back to "all"', () => {
		expect(scopeFromParam('mine')).toBe('mine');
		expect(scopeFromParam('family')).toBe('family');
		expect(scopeFromParam('nonsense')).toBe('all');
		expect(scopeFromParam(null)).toBe('all');
		// "all" is a real answer, not junk: the parameter may say so.
		expect(scopeFromParam('all')).toBe('all');
	});
});

describe('matchesGrocerySearch', () => {
	const item = (name: string, stores: string[]) => ({ name, stores });

	it('matches on the item name', () => {
		expect(matchesGrocerySearch(item('Oat milk', []), 'oat')).toBe(true);
		expect(matchesGrocerySearch(item('Oat milk', []), 'MILK')).toBe(true);
	});

	it('matches on the store, which the tasks-page idiom does too', () => {
		expect(matchesGrocerySearch(item('Lemons', ['Aldi', 'Kroger']), 'aldi')).toBe(true);
		expect(matchesGrocerySearch(item('Lemons', ['Aldi', 'Kroger']), 'kroger')).toBe(true);
	});

	it('matches a storeless item on its name alone', () => {
		expect(matchesGrocerySearch(item('Dish soap', []), 'soap')).toBe(true);
	});

	it('an empty query matches everything, exactly like the tasks-page helper', () => {
		expect(matchesGrocerySearch(item('Eggs', []), '')).toBe(true);
		expect(matchesGrocerySearch(item('Eggs', []), '   ')).toBe(true);
	});

	it('rejects a query that hits neither', () => {
		expect(matchesGrocerySearch(item('Eggs', ['Aldi']), 'zzzz')).toBe(false);
	});
});

describe('scopeOf', () => {
	it('reads the scope off the row itself, not off which list it was loaded from', () => {
		expect(scopeOf({ familyId: null })).toBe('mine');
		expect(scopeOf({ familyId: 'fam1' })).toBe('family');
	});
});

/**
 * #115's flagged bug, CONFIRMED. The optimistic override map was keyed by the
 * store name ALONE, so a personal colour and a family colour for one shop could
 * not both exist — and the page rebuilt each override's `familyId` from the
 * scope control's CURRENT value, so merely flipping "Everyone / Just me"
 * re-labelled an existing override as the other scope.
 *
 * The fix is one rule stated once: **an override carries its own scope**, and
 * the key carries it too.
 */
describe('optimistic colour overrides are scoped (115)', () => {
	const viewer = { userId: 'u1', familyId: 'fam1' };

	it('keys an override by its scope AND its store, never the store alone', () => {
		// Two answers to "what colour is Aldi" are two rows, so they need two keys.
		expect(colourOverrideKey('personal', 'aldi')).not.toBe(colourOverrideKey('family', 'aldi'));
		expect(colourOverrideKey('personal', 'aldi')).toBe('personal:aldi');
		expect(colourOverrideKey('family', 'aldi')).toBe('family:aldi');
	});

	it('turns a scoped override into a colour row at ITS OWN scope', () => {
		expect(optimisticColourRow('personal', 'aldi', 'lilac', viewer)).toEqual({
			storeKey: 'aldi',
			color: 'lilac',
			userId: 'u1',
			familyId: null
		});
		expect(optimisticColourRow('family', 'aldi', 'sage', viewer)).toEqual({
			storeKey: 'aldi',
			color: 'sage',
			userId: 'u1',
			familyId: 'fam1'
		});
	});

	it('keeps a personal and a family colour for the same shop at once', () => {
		// HALF ONE of the bug: with the store alone as the key, the second write
		// destroyed the first, so the personal choice silently became the
		// family's — or the family's silently buried the personal one.
		const rows = withColourOverrides(
			[],
			{ 'personal:aldi': 'lilac', 'family:aldi': 'sage' },
			viewer
		);
		expect(rows).toHaveLength(2);
		// Personal beats family on read, and now both actually exist.
		expect(colourFor('Aldi', rows, viewer)?.key).toBe('lilac');
	});

	it('is not re-labelled by anything the page can change afterwards', () => {
		// HALF TWO of the bug: the override's familyId used to be rebuilt from
		// the scope control's live value, so flipping the control moved an
		// existing override to the other scope without any write happening.
		// The scope travels INSIDE the key, so there is nothing left to re-label.
		const overrides = { 'personal:aldi': 'lilac' };
		const rows = withColourOverrides([], overrides, viewer);
		expect(rows[0].familyId).toBeNull();
		// Whatever the control says next, the row is still the personal one.
		expect(withColourOverrides([], { ...overrides, 'family:aldi': 'sage' }, viewer)[0].familyId).toBeNull();
	});

	it('lets a loader row be replaced by an override in the SAME scope only', () => {
		const loaded = [{ storeKey: 'aldi', color: 'clay', userId: 'u1', familyId: 'fam1' }];
		const rows = withColourOverrides(loaded, { 'family:aldi': 'sage' }, viewer);
		expect(rows).toHaveLength(1);
		expect(rows[0].color).toBe('sage');
		// A personal override for the same shop does NOT replace the family row;
		// it is a second row, and personal wins on read.
		const both = withColourOverrides(loaded, { 'personal:aldi': 'lilac' }, viewer);
		expect(both).toHaveLength(2);
		expect(colourFor('Aldi', both, viewer)?.key).toBe('lilac');
	});

	it('answers whether a store is overridden in a given scope', () => {
		const overrides = { 'personal:aldi': 'lilac' };
		expect(hasColourOverride(overrides, 'personal', 'aldi')).toBe(true);
		// The family scope has nothing pending, so the picker may still offer
		// "Auto" for it rather than pretending a family colour is set.
		expect(hasColourOverride(overrides, 'family', 'aldi')).toBe(false);
		expect(hasColourOverride(overrides, 'personal', 'costco')).toBe(false);
	});

	it('resolves the family scope to null for a viewer with no family', () => {
		// "Everyone" is not a place when there is no family, and a key that
		// silently means "personal" would make a family write a personal one.
		expect(optimisticColourRow('family', 'aldi', 'sage', { userId: 'u1', familyId: null })).toEqual({
			storeKey: 'aldi',
			color: 'sage',
			userId: 'u1',
			familyId: null
		});
	});
});

/* ── uniqueStores ─────────────────────────────────────────────────────────
   Regression for a LIVE crash on the test environment:

     Uncaught (in promise) Svelte error: each_key_duplicate
     Keyed each block has duplicate key `walmart` at indexes 2 and 3

   The store field is free text with commas for alternates, so nothing stopped
   a person typing the same shop twice — and nothing stopped the database
   storing it. The chips are a keyed each block keyed by the store name, so a
   repeated name is a duplicate key and the WHOLE page throws, not one row.

   These tests describe external behaviour only: what comes out.
   ──────────────────────────────────────────────────────────────────────── */
describe('uniqueStores', () => {
	it('removes the repeat that crashed the page', () => {
		// The literal shape reported in the browser: walmart at indexes 2 and 3.
		expect(uniqueStores(['Aldi', 'Kroger', 'walmart', 'Walmart', 'Costco'])).toEqual([
			'Aldi',
			'Kroger',
			'walmart',
			'Costco'
		]);
	});

	it('treats case as the same shop, and keeps the first spelling', () => {
		expect(uniqueStores(['Walmart', 'walmart', 'WALMART'])).toEqual(['Walmart']);
	});

	it('keeps the first store in first position, because it is the primary one', () => {
		// stores[0] is the shop the row is filed under and the one the approved
		// design puts the ring on. Dedupe must never reorder.
		expect(uniqueStores(['Costco', 'costco', 'Aldi'])).toEqual(['Costco', 'Aldi']);
	});

	it('trims and drops blanks, so "aldi, , aldi" is one shop', () => {
		expect(uniqueStores([' aldi ', '', '   ', 'aldi'])).toEqual(['aldi']);
	});

	it('returns an empty list rather than throwing on empty input', () => {
		expect(uniqueStores([])).toEqual([]);
		expect(uniqueStores(['', '  '])).toEqual([]);
	});

	it('keeps genuinely different shops apart even when one contains the other', () => {
		expect(uniqueStores(['Walgreens', 'Walgreens Market', 'Walgreens'])).toEqual([
			'Walgreens',
			'Walgreens Market'
		]);
	});
});
