/**
 * The groceries page's list rules: the summary line, the filter counts, the
 * store names and collisions, the scoped picker value, the empty-state copy,
 * the two failure sentences, the add/colour toast copy (Q-038 B), and the
 * local list edits a write applies once the server has agreed.
 * Tables of input -> expected output, no setup.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { GroceryListItem, StoreColourRow } from './groceries.contract';
import { NO_STORE_LABEL } from './groceries.items.rules';
import {
	groceryAddedToast,
	groceryColourRowsApplied,
	groceryColourStores,
	groceryColourToast,
	groceryEmptyCopy,
	groceryEntryTime,
	groceryFailureCopy,
	groceryItemMoved,
	groceryItemsStoresReplaced,
	groceryItemsWith,
	groceryItemsWithout,
	groceryPickerValue,
	groceryScopeCount,
	grocerySharedColourStores,
	groceryStoreNames,
	grocerySummaryLine
} from './groceries.list.rules';

const viewer = { userId: 'u1', familyId: 'fam1' };
const loneViewer = { userId: 'u1', familyId: null };

function item(overrides: Partial<GroceryListItem> & { id: string }): GroceryListItem {
	return {
		name: 'Milk',
		quantity: 1,
		stores: [],
		familyId: null,
		createdAt: '2026-03-01T09:00:00.000Z',
		...overrides
	};
}

function row(storeKey: string, color: string, familyId: string | null = null): StoreColourRow {
	return { storeKey, color, userId: 'u1', familyId };
}

describe('grocerySummaryLine', () => {
	it.each([
		[[{ quantity: 2 }, { quantity: 1 }], '2 items · 3 total'],
		[[{ quantity: 6 }], '1 item · 6 total'],
		[[], '0 items · 0 total']
	])('%j -> %s', (items, expected) => {
		expect(grocerySummaryLine(items)).toBe(expected);
	});
});

describe('groceryScopeCount', () => {
	const rows = [
		item({ id: 'a' }),
		item({ id: 'b', familyId: 'fam1' }),
		item({ id: 'c' })
	];

	it('counts the one list for "all" and each scope otherwise', () => {
		expect(groceryScopeCount(rows, 'all')).toBe(3);
		expect(groceryScopeCount(rows, 'mine')).toBe(2);
		expect(groceryScopeCount(rows, 'family')).toBe(1);
	});
});

describe('groceryStoreNames', () => {
	it('lists every store a row mentions, first seen first, without repeats', () => {
		expect(
			groceryStoreNames([
				item({ id: 'a', stores: ['Aldi', 'Costco'] }),
				item({ id: 'b', stores: ['costco', 'Lidl'] }),
				item({ id: 'c', stores: [] })
			])
		).toEqual(['Aldi', 'Costco', 'Lidl']);
	});

	it('is ONE entry per shop under any spelling — a duplicate key would kill the page', () => {
		expect(
			groceryStoreNames([
				item({ id: 'a', stores: ['Aldi'] }),
				item({ id: 'b', stores: [' aldi ', 'Costco'] })
			])
		).toEqual(['Aldi', 'Costco']);
	});

	it('skips a blank store: it is no shop to offer', () => {
		expect(groceryStoreNames([item({ id: 'a', stores: ['  ', 'Aldi'] })])).toEqual(['Aldi']);
	});
});

describe('groceryColourStores', () => {
	it('drops blanks and "Any store", which is the absence of a shop', () => {
		expect(groceryColourStores(['Aldi', '  ', NO_STORE_LABEL, 'Costco'])).toEqual([
			'Aldi',
			'Costco'
		]);
	});
});

describe('grocerySharedColourStores', () => {
	it('names every shop on a swatch with more than one shop, in first-seen order', () => {
		expect(
			grocerySharedColourStores(
				['Aldi', 'Lidl', 'Costco'],
				[row('aldi', 'sky'), row('lidl', 'sky'), row('costco', 'sage')],
				loneViewer
			)
		).toEqual(['Aldi', 'Lidl']);
	});

	it('says nothing when every shop has its own swatch', () => {
		expect(
			grocerySharedColourStores(
				['Aldi', 'Costco'],
				[row('aldi', 'sky'), row('costco', 'sage')],
				loneViewer
			)
		).toEqual([]);
	});
});

describe('groceryPickerValue', () => {
	const rows = [row('aldi', 'sky', null), row('aldi', 'sage', 'fam1')];

	it('prefers a pending override at the scope it was made at', () => {
		expect(
			groceryPickerValue(rows, { 'personal:aldi': 'amber' }, 'personal', 'Aldi', viewer)
		).toBe('amber');
	});

	it('falls back to the stored row AT THAT scope', () => {
		expect(groceryPickerValue(rows, {}, 'personal', 'Aldi', viewer)).toBe('sky');
		expect(groceryPickerValue(rows, {}, 'family', 'Aldi', viewer)).toBe('sage');
	});

	it('answers "auto" when that scope has no row', () => {
		expect(groceryPickerValue([], {}, 'family', 'Aldi', viewer)).toBe('auto');
	});

	it('ignores an undeclared colour in a row', () => {
		expect(groceryPickerValue([row('aldi', 'chartreuse')], {}, 'personal', 'Aldi', viewer)).toBe(
			'auto'
		);
	});
});

describe('groceryEmptyCopy', () => {
	it.each([
		[{ query: 'milk', filter: 'all', hasFamily: true }, 'No items match “milk”.'],
		[{ query: '  ', filter: 'mine', hasFamily: true }, 'Your list is empty. Add the first item.'],
		[
			{ query: '', filter: 'family', hasFamily: true },
			'The family list is empty. Add the first item.'
		],
		[
			{ query: '', filter: 'family', hasFamily: false },
			'No family list yet — join or create a family to use the shared list.'
		],
		[
			{ query: '', filter: 'all', hasFamily: false },
			'Both lists are empty. Add the first item.'
		]
	] as const)('%j -> %s', (input, expected) => {
		expect(groceryEmptyCopy(input)).toBe(expected);
	});
});

describe('groceryFailureCopy', () => {
	it('tells a refused request from a dead network', () => {
		expect(groceryFailureCopy("Couldn't check that off", 500)).toBe(
			"Couldn't check that off. Try again."
		);
		expect(groceryFailureCopy("Couldn't check that off", 0)).toBe(
			"Couldn't check that off — check your connection and try again."
		);
	});
});

describe('groceryAddedToast', () => {
	it('names the store the created row actually carries (Q-038 B)', () => {
		expect(groceryAddedToast('milk 2', 'mine', { stores: ['Aldi'] })).toBe(
			'Added "milk 2" to Mine — Aldi.'
		);
	});

	it('drops the clause when the row has no store', () => {
		expect(groceryAddedToast('milk', 'family', { stores: [] })).toBe('Added "milk" to Family.');
	});

	it('drops the clause when the response carries no row', () => {
		expect(groceryAddedToast('milk', 'mine', null)).toBe('Added "milk" to Mine.');
	});

	it('echoes the typed text trimmed, like legacy', () => {
		expect(groceryAddedToast('  eggs 6  ', 'family', { stores: ['Lidl'] })).toBe(
			'Added "eggs 6" to Family — Lidl.'
		);
	});
});

describe('groceryColourToast', () => {
	it('names the swatch and says when it is the person’s own choice', () => {
		expect(groceryColourToast('Aldi', 'sky', 'personal')).toBe('Aldi is now Blue (just you).');
		expect(groceryColourToast('Aldi', 'sage', 'family')).toBe('Aldi is now Mint.');
	});

	it('says auto is back to the store’s own default', () => {
		expect(groceryColourToast('Aldi', 'auto', 'family')).toBe(
			'Aldi is back to its own default colour.'
		);
	});
});

describe('groceryEntryTime', () => {
	it('reads either a Date or an ISO string — the loader and the wire both reach the page', () => {
		expect(groceryEntryTime({ createdAt: new Date('2026-03-01T09:00:00.000Z') })).toBe(
			Date.parse('2026-03-01T09:00:00.000Z')
		);
		expect(groceryEntryTime({ createdAt: '2026-03-01T09:00:00.000Z' })).toBe(
			Date.parse('2026-03-01T09:00:00.000Z')
		);
	});
});

describe('groceryItemsWith', () => {
	it('appends the newest row, and puts an older one back in its place', () => {
		const list = [
			item({ id: 'a', createdAt: '2026-03-01T00:00:00.000Z' }),
			item({ id: 'b', createdAt: '2026-03-02T00:00:00.000Z' })
		];
		expect(groceryItemsWith(list, item({ id: 'c', createdAt: '2026-03-03T00:00:00.000Z' })).map(
			(entry) => entry.id
		)).toEqual(['a', 'b', 'c']);
		expect(groceryItemsWith(list, item({ id: 'z', createdAt: '2026-03-01T12:00:00.000Z' })).map(
			(entry) => entry.id
		)).toEqual(['a', 'z', 'b']);
	});
});

describe('groceryItemsWithout', () => {
	it('drops one row and leaves the rest in order', () => {
		const list = [item({ id: 'a' }), item({ id: 'b' })];
		expect(groceryItemsWithout(list, 'a').map((entry) => entry.id)).toEqual(['b']);
		expect(groceryItemsWithout(list, 'nope').map((entry) => entry.id)).toEqual(['a', 'b']);
	});
});

describe('groceryItemsStoresReplaced', () => {
	it('replaces one row’s store list: an empty list clears it (Q-037)', () => {
		const list = [item({ id: 'a', stores: ['Aldi'] }), item({ id: 'b', stores: ['Lidl'] })];
		expect(groceryItemsStoresReplaced(list, 'a', ['Costco', 'Aldi'])[0]?.stores).toEqual([
			'Costco',
			'Aldi'
		]);
		expect(groceryItemsStoresReplaced(list, 'b', [])[1]?.stores).toEqual([]);
	});
});

describe('groceryItemMoved', () => {
	it('re-owns the row to the target scope', () => {
		const entry = item({ id: 'a', familyId: 'fam1' });
		expect(groceryItemMoved(entry, 'mine', viewer).familyId).toBeNull();
		expect(groceryItemMoved(entry, 'family', viewer).familyId).toBe('fam1');
	});
});

describe('groceryColourRowsApplied', () => {
	it('replaces the personal row in place, or starts one', () => {
		const rows = [row('aldi', 'sky'), row('aldi', 'sage', 'fam1')];
		const applied = groceryColourRowsApplied(rows, {
			store: 'Aldi',
			color: 'amber',
			scope: 'personal',
			viewer
		});
		expect(applied).toEqual([row('aldi', 'amber'), row('aldi', 'sage', 'fam1')]);
	});

	it('records the writer on a new family row, like the wire', () => {
		expect(
			groceryColourRowsApplied([], {
				store: 'Aldi',
				color: 'sage',
				scope: 'family',
				viewer
			})
		).toEqual([{ storeKey: 'aldi', color: 'sage', userId: 'u1', familyId: 'fam1' }]);
	});

	it('auto clears that ONE scope’s row and leaves the other alone', () => {
		const rows = [row('aldi', 'sky'), row('aldi', 'sage', 'fam1')];
		expect(
			groceryColourRowsApplied(rows, { store: 'Aldi', color: 'auto', scope: 'personal', viewer })
		).toEqual([row('aldi', 'sage', 'fam1')]);
		expect(
			groceryColourRowsApplied(rows, { store: 'Aldi', color: 'auto', scope: 'family', viewer })
		).toEqual([row('aldi', 'sky')]);
	});
});
