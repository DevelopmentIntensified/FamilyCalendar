/**
 * The Store Colour rules: the closed palette, the store key, the name-derived
 * default, personal -> family -> name resolution, grouping + colour as one
 * concept (#115), collision disclosure and the scoped optimistic overrides.
 * Tables of input -> expected output, no setup. The cases that encode a real
 * rule carry over from the legacy `src/lib/data/groceries.test.ts`.
 *
 * Expected default swatches are worked by hand from the documented name hash
 * (`hash = charCode + ((hash << 5) - hash)`, int32 shift, then `abs % 6`):
 * "aldi" = 2996720, 2996720 % 6 = 2 -> sage; "heb" = 103173, % 6 = 3 -> lilac;
 * "costco" and "lidl" both land on index 1 -> sky.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { StoreColourRow } from './groceries.contract';
import { NO_STORE_LABEL } from './groceries.items.rules';
import {
	applyGroceryColourOverrides,
	defaultGroceryStoreColour,
	groceryColourOverrideKey,
	groceryColourScopeOf,
	groceryColourKeyOf,
	groceryStoreKey,
	groceryStoresSharingColour,
	groupGroceryItems,
	hasGroceryColourOverride,
	isStoreColourKey,
	resolveGroceryStoreColour,
	STORE_COLOURS
} from './groceries.colours.rules';

const viewer = { userId: 'u1', familyId: 'fam1' };
const loneViewer = { userId: 'u1', familyId: null };

function row(
	storeKey: string,
	color: string,
	userId: string,
	familyId: string | null
): StoreColourRow {
	return { storeKey, color, userId, familyId };
}

describe('STORE_COLOURS', () => {
	it('is the six curated swatches, in order', () => {
		expect(STORE_COLOURS.map((colour) => colour.key)).toEqual([
			'terracotta',
			'sky',
			'sage',
			'lilac',
			'amber',
			'slate'
		]);
	});

	it('names each swatch for people, never by its CSS', () => {
		expect(STORE_COLOURS.map((colour) => colour.label)).toEqual([
			'Terracotta',
			'Blue',
			'Mint',
			'Lavender',
			'Amber',
			'Slate'
		]);
	});

	it('has a unique key per swatch', () => {
		expect(new Set(STORE_COLOURS.map((colour) => colour.key)).size).toBe(STORE_COLOURS.length);
	});
});

describe('isStoreColourKey', () => {
	it.each<[string, unknown, boolean]>([
		['a declared key', 'sky', true],
		['a free colour', '#ff0000', false],
		['the empty string', '', false],
		['null', null, false],
		['a different case', 'Sky', false],
		['a label, not a key', 'Blue', false],
		['"auto" is a write verb, not a colour', 'auto', false],
		['a number', 1, false]
	])('(%s)', (_label, value, expected) => {
		expect(isStoreColourKey(value)).toBe(expected);
	});

	it('accepts every declared key', () => {
		for (const colour of STORE_COLOURS) expect(isStoreColourKey(colour.key)).toBe(true);
	});
});

describe('groceryColourKeyOf', () => {
	it.each<[string, string | null | undefined, string | null]>([
		['a shop is its trim + lowercase key', '  Aldi ', 'aldi'],
		['the no-store label is not a shop', NO_STORE_LABEL, null],
		['the no-store label with padding is not a shop', '  Any store  ', null],
		// Legacy compares the label case-sensitively: a lowercase "any store" is a real shop.
		['a lowercase "any store" is a real shop', 'any store', 'any store'],
		['blank is no store', '   ', null],
		['the empty string is no store', '', null],
		['null is no store', null, null],
		['undefined is no store', undefined, null]
	])('%s', (_label, name, expected) => {
		expect(groceryColourKeyOf(name)).toBe(expected);
	});
});

describe('groceryStoreKey', () => {
	it.each<[string, string]>([
		['Aldi', 'aldi'],
		['  ALDI ', 'aldi'],
		['Whole Foods', 'whole foods'],
		['   ', '']
	])('(%j) -> %j', (name, expected) => {
		expect(groceryStoreKey(name)).toBe(expected);
	});
});

describe('defaultGroceryStoreColour', () => {
	it.each<[string, string]>([
		['Aldi', 'sage'],
		['HEB', 'lilac'],
		['Costco', 'sky'],
		['Target', 'slate'],
		['Walmart', 'terracotta'],
		['Whole Foods', 'amber']
	])('derives %j from the name -> %s', (name, expected) => {
		expect(defaultGroceryStoreColour(name).key).toBe(expected);
	});

	it('is the same swatch under any spelling, so adding a store never repaints the others', () => {
		expect(defaultGroceryStoreColour('Aldi')).toEqual(defaultGroceryStoreColour('  ALDI '));
		expect(defaultGroceryStoreColour('Costco')).toEqual(defaultGroceryStoreColour('costco'));
	});

	it('always lands inside the declared palette', () => {
		for (const name of ['Aldi', 'Kroger', 'Costco', 'Whole Foods', 'Lidl', 'Safeway', 'Publix']) {
			expect(isStoreColourKey(defaultGroceryStoreColour(name).key)).toBe(true);
		}
	});

	it('is allowed to collide: six swatches, unlimited stores (Costco and Lidl share one)', () => {
		expect(defaultGroceryStoreColour('Lidl').key).toBe(defaultGroceryStoreColour('Costco').key);
	});
});

describe('resolveGroceryStoreColour — personal, then family, then default', () => {
	const rows = [
		row('aldi', 'sky', 'u1', null),
		row('aldi', 'sage', 'u1', 'fam1'),
		row('kroger', 'sage', 'u1', 'fam1')
	];

	it.each<[string, string, string]>([
		['tier 1 — a personal row wins over the family row', 'Aldi', 'sky'],
		['tier 2 — the family row applies without a personal override', 'Kroger', 'sage'],
		['tier 3 — an unconfigured store gets its name-derived default', 'Heb', 'lilac'],
		['keys on the name, not the display string (lower case)', 'aldi', 'sky'],
		['keys on the name, not the display string (upper case)', 'ALDI', 'sky'],
		['keys on the name, not the display string (padded)', '  Aldi  ', 'sky']
	])('%s', (_label, name, expected) => {
		expect(resolveGroceryStoreColour(name, rows, viewer)?.key).toBe(expected);
	});

	it.each<[string, string | null | undefined]>([
		['the no-store label', NO_STORE_LABEL],
		['an absent store', null],
		['an undefined store', undefined],
		['the empty string', ''],
		['whitespace', '   '],
		['the no-store label with padding', '  Any store  ']
	])('never tints %s — an absent store is not a shop', (_label, name) => {
		expect(resolveGroceryStoreColour(name, rows, viewer)).toBeNull();
	});

	it("another member's personal row is not this viewer's", () => {
		const others = [row('aldi', 'sky', 'u2', null)];
		expect(resolveGroceryStoreColour('Aldi', others, viewer)?.key).toBe('sage');
	});

	it("another family's row is not this viewer's family row", () => {
		const others = [row('aldi', 'sky', 'u2', 'fam2')];
		expect(resolveGroceryStoreColour('Aldi', others, viewer)?.key).toBe('sage');
	});

	it('a viewer without a family never matches a family row', () => {
		const familyOnly = [row('aldi', 'sky', 'u1', 'fam1')];
		expect(resolveGroceryStoreColour('Aldi', familyOnly, loneViewer)?.key).toBe('sage');
	});

	it('ignores a colour the palette does not declare rather than rendering it', () => {
		const junk = [row('aldi', 'chartreuse', 'u1', null)];
		expect(resolveGroceryStoreColour('Aldi', junk, viewer)?.key).toBe('sage');
	});

	it('an undeclared personal colour lets the family tier apply', () => {
		const mixed = [row('kroger', 'chartreuse', 'u1', null), row('kroger', 'amber', 'u1', 'fam1')];
		expect(resolveGroceryStoreColour('Kroger', mixed, viewer)?.key).toBe('amber');
	});

	it('answers the same for the same viewer whichever list is open', () => {
		// The viewer decides the resolution, never the open list.
		expect(resolveGroceryStoreColour('Aldi', rows, viewer)).toEqual(
			resolveGroceryStoreColour('Aldi', rows, viewer)
		);
	});

	it('returns the full declared swatch, with its classes', () => {
		expect(resolveGroceryStoreColour('Aldi', rows, viewer)).toEqual(
			STORE_COLOURS.find((colour) => colour.key === 'sky')
		);
	});
});

describe('groupGroceryItems', () => {
	const colourRows = [row('aldi', 'sky', 'u1', null), row('kroger', 'sage', 'u1', 'fam1')];

	it('groups by primary store, the storeless under "Any store"', () => {
		const groups = groupGroceryItems(
			[
				{ id: '1', name: 'milk', stores: ['Aldi', 'Kroger'] },
				{ id: '2', name: 'eggs', stores: [] },
				{ id: '3', name: 'bread', stores: ['Aldi'] }
			],
			[],
			viewer
		);
		expect(groups.map((group) => group.store)).toEqual(['Aldi', 'Any store']);
		expect(groups[0].items.map((item) => item.name)).toEqual(['milk', 'bread']);
	});

	it('merges stores case-agnostically, the first-seen label wins', () => {
		const groups = groupGroceryItems(
			[
				{ id: '1', stores: ['Aldi'] },
				{ id: '2', stores: ['aldi', 'Kroger'] }
			],
			[],
			viewer
		);
		expect(groups).toHaveLength(1);
		expect(groups[0].store).toBe('Aldi');
	});

	it('sorts store groups alphabetically, not by insertion order', () => {
		const groups = groupGroceryItems(
			[
				{ id: '1', stores: ['Whole Foods'] },
				{ id: '2', stores: ['Aldi'] },
				{ id: '3', stores: ['Costco'] },
				{ id: '4', stores: [] }
			],
			[],
			viewer
		);
		expect(groups.map((group) => group.store)).toEqual([
			'Aldi',
			'Any store',
			'Costco',
			'Whole Foods'
		]);
	});

	it('sorts case-insensitively', () => {
		const groups = groupGroceryItems(
			[
				{ id: '1', stores: ['bakery'] },
				{ id: '2', stores: ['Aldi'] },
				{ id: '3', stores: ['Costco'] }
			],
			[],
			viewer
		);
		expect(groups.map((group) => group.store)).toEqual(['Aldi', 'bakery', 'Costco']);
	});

	it('keeps items inside a group in arrival order while sorting the groups', () => {
		const groups = groupGroceryItems(
			[
				{ id: '1', name: 'zeta', stores: ['Aldi'] },
				{ id: '2', name: 'apple', stores: ['Aldi'] },
				{ id: '3', name: 'milk', stores: ['Baker'] }
			],
			[],
			viewer
		);
		expect(groups.map((group) => group.store)).toEqual(['Aldi', 'Baker']);
		expect(groups[0].items.map((item) => item.name)).toEqual(['zeta', 'apple']);
	});

	it('group keys use the ONE convention: trimmed, so " Costco " joins "Costco" (#115)', () => {
		const groups = groupGroceryItems(
			[
				{ id: '1', stores: [' Costco '] },
				{ id: '2', stores: ['Costco'] }
			],
			[],
			viewer
		);
		expect(groups).toHaveLength(1);
	});

	it('groups the no-store items under the disclosed NO_STORE_LABEL and never tints them', () => {
		const groups = groupGroceryItems([{ id: '1', stores: [] }], colourRows, viewer);
		expect(groups).toHaveLength(1);
		expect(groups[0].store).toBe(NO_STORE_LABEL);
		expect(groups[0].items).toEqual([{ id: '1', stores: [] }]);
		expect(groups[0].colour).toBeNull();
	});

	it('returns each group with its colour attached, in one call', () => {
		const groups = groupGroceryItems(
			[
				{ id: '1', stores: ['Aldi'] },
				{ id: '2', stores: ['Kroger'] },
				{ id: '3', stores: [] }
			],
			colourRows,
			viewer
		);
		expect(groups.find((group) => group.store === 'Aldi')?.colour?.key).toBe('sky');
		expect(groups.find((group) => group.store === 'Kroger')?.colour?.key).toBe('sage');
	});

	it('the same shop is the same colour under any spelling', () => {
		const groups = groupGroceryItems([{ id: '1', stores: [' Costco '] }], colourRows, viewer);
		expect(groups[0].colour).toEqual(resolveGroceryStoreColour('costco', colourRows, viewer));
	});

	it('an unconfigured store is deterministic: the name-derived default', () => {
		const groups = groupGroceryItems([{ id: '1', stores: ['HEB'] }], [], viewer);
		expect(groups[0].colour?.key).toBe('lilac');
	});

	it('matches the single-store resolution for every tier (personal, family, default)', () => {
		const groups = groupGroceryItems(
			[
				{ id: '1', stores: ['Aldi'] },
				{ id: '2', stores: ['Kroger'] },
				{ id: '3', stores: ['Lidl'] }
			],
			colourRows,
			viewer
		);
		for (const group of groups) {
			expect(group.colour).toEqual(resolveGroceryStoreColour(group.store, colourRows, viewer));
		}
	});

	it('is empty for no items', () => {
		expect(groupGroceryItems([], colourRows, viewer)).toEqual([]);
	});
});

describe('groceryStoresSharingColour', () => {
	it.each<[string, string, string[], StoreColourRow[], string[]]>([
		['names the other stores on the same swatch', 'Costco', ['Costco', 'Lidl'], [], ['Lidl']],
		['is empty when the store is alone on its swatch', 'HEB', ['HEB', 'Target'], [], []],
		['never counts "Any store" as a twin — it is not tinted', 'Any store', ['Any store', 'Lidl'], [], []],
		['never lists another spelling of the same shop', 'Costco', ['Costco', 'costco', 'Lidl'], [], ['Lidl']],
		[
			'follows a personal colour: moving Lidl away ends the collision',
			'Costco',
			['Costco', 'Lidl'],
			[row('lidl', 'terracotta', 'u1', null)],
			[]
		],
		[
			'follows a personal colour: moving Lidl onto Walmart makes them twins',
			'Lidl',
			['Lidl', 'Walmart', 'Costco'],
			[row('lidl', 'terracotta', 'u1', null)],
			['Walmart']
		]
	])('%s', (_label, name, names, rows, expected) => {
		expect(groceryStoresSharingColour(name, names, rows, viewer)).toEqual(expected);
	});
});

describe('groceryColourScopeOf', () => {
	it.each<[string, unknown, 'family' | 'personal']>([
		['the exact string family', 'family', 'family'],
		['personal', 'personal', 'personal'],
		['absent', undefined, 'personal'],
		['a different case', 'Family', 'personal'],
		['all', 'all', 'personal'],
		['a number', 1, 'personal'],
		['null', null, 'personal']
	])('%s', (_label, raw, expected) => {
		expect(groceryColourScopeOf(raw)).toBe(expected);
	});
});

/**
 * #115's flagged bug: the override map was keyed by the store NAME alone, so a
 * personal and a family colour for one shop could not both exist, and flipping
 * the scope control re-labelled an existing override. One rule: an override
 * carries its own scope, and the key carries it too.
 */
describe('optimistic colour overrides are scoped (#115)', () => {
	it('keys an override by its scope AND its store, never the store alone', () => {
		expect(groceryColourOverrideKey('personal', 'aldi')).not.toBe(
			groceryColourOverrideKey('family', 'aldi')
		);
		expect(groceryColourOverrideKey('personal', 'aldi')).toBe('personal:aldi');
		expect(groceryColourOverrideKey('family', 'aldi')).toBe('family:aldi');
	});

	it('turns a scoped override into a colour row at ITS OWN scope', () => {
		expect(applyGroceryColourOverrides([], { 'personal:aldi': 'lilac' }, viewer)).toEqual([
			row('aldi', 'lilac', 'u1', null)
		]);
		expect(applyGroceryColourOverrides([], { 'family:aldi': 'sage' }, viewer)).toEqual([
			row('aldi', 'sage', 'u1', 'fam1')
		]);
	});

	it('keeps a personal and a family colour for the same shop at once', () => {
		const rows = applyGroceryColourOverrides(
			[],
			{ 'personal:aldi': 'lilac', 'family:aldi': 'sage' },
			viewer
		);
		expect(rows).toHaveLength(2);
		// Personal beats family on read, and now both actually exist.
		expect(resolveGroceryStoreColour('Aldi', rows, viewer)?.key).toBe('lilac');
	});

	it('is not re-labelled by anything the page can change afterwards', () => {
		const personal = { 'personal:aldi': 'lilac' };
		expect(applyGroceryColourOverrides([], personal, viewer)[0].familyId).toBeNull();
		// Another override arriving never moves the first one to its scope.
		const both = { ...personal, 'family:aldi': 'sage' };
		expect(applyGroceryColourOverrides([], both, viewer)[0].familyId).toBeNull();
	});

	it('lets a loader row be replaced by an override in the SAME scope only', () => {
		const loaded = [row('aldi', 'clay', 'u1', 'fam1')];
		const replaced = applyGroceryColourOverrides(loaded, { 'family:aldi': 'sage' }, viewer);
		expect(replaced).toEqual([row('aldi', 'sage', 'u1', 'fam1')]);
		// A personal override for the same shop does NOT replace the family row:
		// it is a second row, and personal wins on read.
		const both = applyGroceryColourOverrides(loaded, { 'personal:aldi': 'lilac' }, viewer);
		expect(both).toHaveLength(2);
		expect(resolveGroceryStoreColour('Aldi', both, viewer)?.key).toBe('lilac');
	});

	it('resolves the family scope to a personal row for a viewer with no family', () => {
		// With no family, "everyone" is just you.
		expect(applyGroceryColourOverrides([], { 'family:aldi': 'sage' }, loneViewer)).toEqual([
			row('aldi', 'sage', 'u1', null)
		]);
	});

	it('does not mutate the loaded rows', () => {
		const loaded = [row('aldi', 'clay', 'u1', 'fam1')];
		applyGroceryColourOverrides(loaded, { 'family:aldi': 'sage' }, viewer);
		expect(loaded).toEqual([row('aldi', 'clay', 'u1', 'fam1')]);
	});

	it('keeps a colon inside the store key', () => {
		expect(applyGroceryColourOverrides([], { 'personal:a:b': 'sky' }, viewer)).toEqual([
			row('a:b', 'sky', 'u1', null)
		]);
	});

	it.each<[string, Record<string, string>]>([
		['an unscoped legacy key (the pre-#115 shape)', { aldi: 'sky' }],
		['a key that starts with the separator', { ':aldi': 'sky' }],
		['an unknown scope', { 'all:aldi': 'sky' }],
		['a different case of a scope', { 'Family:aldi': 'sky' }],
		['an empty colour', { 'personal:aldi': '' }]
	])('drops %s', (_label, overrides) => {
		expect(applyGroceryColourOverrides([], overrides, viewer)).toEqual([]);
	});

	// Legacy quirk, pinned and reported for the owner: the match includes the
	// row's `userId` (the WRITER, Q-035), so a pending family override does not
	// replace a family row another member wrote. It is appended behind it, and
	// the first family row still wins on read.
	it('does not replace a family row another member wrote (legacy quirk, Q-035)', () => {
		const loaded = [row('aldi', 'amber', 'u2', 'fam1')];
		const merged = applyGroceryColourOverrides(loaded, { 'family:aldi': 'sage' }, viewer);
		expect(merged).toEqual([row('aldi', 'amber', 'u2', 'fam1'), row('aldi', 'sage', 'u1', 'fam1')]);
	});

	it('answers whether a store is overridden in a given scope', () => {
		const overrides = { 'personal:aldi': 'lilac' };
		expect(hasGroceryColourOverride(overrides, 'personal', 'aldi')).toBe(true);
		// The family scope has nothing pending, so the picker may still offer
		// "Auto" for it rather than pretending a family colour is set.
		expect(hasGroceryColourOverride(overrides, 'family', 'aldi')).toBe(false);
		expect(hasGroceryColourOverride(overrides, 'personal', 'costco')).toBe(false);
		expect(hasGroceryColourOverride({ 'personal:aldi': '' }, 'personal', 'aldi')).toBe(false);
	});
});
