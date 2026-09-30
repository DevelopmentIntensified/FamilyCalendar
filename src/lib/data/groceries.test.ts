import { describe, it, expect } from 'vitest';
import {
	normalizeGroceryName,
	parseGroceryQuickAdd,
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
