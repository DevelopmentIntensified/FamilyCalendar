/**
 * The item rules: quick-add parse, history key, the one store clean, the Store
 * Memory pick, the search predicate, the suggest-read truthiness and the PATCH
 * op narrowing. Tables of input -> expected output, no setup. The cases that
 * encode a real rule carry over from the legacy `src/lib/data/groceries.test.ts`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	clampGroceryQuantity,
	cleanGroceryStores,
	groceryChangeOf,
	grocerySuggestionName,
	matchesGrocerySearch,
	matchingGroceryMemoryRow,
	mostFrequentGroceryStore,
	normalizeGroceryName,
	NO_STORE_LABEL,
	parseGroceryQuickAdd,
	type GroceryChange
} from './groceries.items.rules';

describe('NO_STORE_LABEL', () => {
	it('is the disclosed "Any store" group, which is not a shop', () => {
		expect(NO_STORE_LABEL).toBe('Any store');
	});
});

describe('normalizeGroceryName', () => {
	// legacy groceries.test.ts › normalizeGroceryName
	it.each<[string, string]>([
		['Milk', 'milk'],
		['  Oat Milk  ', 'oat milk'],
		['EGGS', 'eggs'],
		['  ', '']
	])('(%j) -> %j', (input, expected) => {
		expect(normalizeGroceryName(input)).toBe(expected);
	});
});

describe('parseGroceryQuickAdd', () => {
	// legacy groceries.test.ts › parseGroceryQuickAdd
	it.each<[string, { name: string; quantity: number }]>([
		['milk', { name: 'milk', quantity: 1 }],
		['milk 2', { name: 'milk', quantity: 2 }],
		['2 milk', { name: 'milk', quantity: 2 }],
		['oat milk 12', { name: 'oat milk', quantity: 12 }],
		['  Eggs   6  ', { name: 'Eggs', quantity: 6 }],
		['', { name: '', quantity: 1 }]
	])('(%j)', (input, expected) => {
		expect(parseGroceryQuickAdd(input)).toEqual(expected);
	});

	it.each<[string, string, { name: string; quantity: number }]>([
		['blank is an empty name', '   ', { name: '', quantity: 1 }],
		['four digits is a quantity (trailing)', 'water 1234', { name: 'water', quantity: 1234 }],
		['four digits is a quantity (leading)', '1234 water', { name: 'water', quantity: 1234 }],
		[
			'five digits are part of the name (trailing)',
			'milk 12345',
			{ name: 'milk 12345', quantity: 1 }
		],
		[
			'five digits are part of the name (leading)',
			'12345 eggs',
			{ name: '12345 eggs', quantity: 1 }
		],
		['a number with no space is part of the name', 'milk2', { name: 'milk2', quantity: 1 }],
		['a lone number is a name', '5', { name: '5', quantity: 1 }],
		// The trailing pattern is tried first, so it wins when both ends carry one.
		['both ends: the trailing quantity wins', '2 milk 3', { name: '2 milk', quantity: 3 }],
		['two numbers: the trailing one is the quantity', '2 3', { name: '2', quantity: 3 }],
		// The floor/clamp to >= 1 is the add use-case's rule, not the parse's.
		['a zero quantity is parsed as written', 'milk 0', { name: 'milk', quantity: 0 }]
	])('%s', (_label, input, expected) => {
		expect(parseGroceryQuickAdd(input)).toEqual(expected);
	});
});

describe('cleanGroceryStores', () => {
	// legacy groceries.test.ts › uniqueStores; the write-path cleanStores is the same rule.
	it.each<[string, string[], string[]]>([
		[
			'removes the repeat that crashed the page (each_key_duplicate)',
			['Aldi', 'Kroger', 'walmart', 'Walmart', 'Costco'],
			['Aldi', 'Kroger', 'walmart', 'Costco']
		],
		['treats case as the same shop, and keeps the first spelling', ['Walmart', 'walmart', 'WALMART'], ['Walmart']],
		[
			'keeps the first store in first position, because it is the primary one',
			['Costco', 'costco', 'Aldi'],
			['Costco', 'Aldi']
		],
		['trims and drops blanks, so "aldi, , aldi" is one shop', [' aldi ', '', '   ', 'aldi'], ['aldi']],
		['returns an empty list for empty input', [], []],
		['returns an empty list for blanks only', ['', '  '], []],
		[
			'keeps genuinely different shops apart even when one contains the other',
			['Walgreens', 'Walgreens Market', 'Walgreens'],
			['Walgreens', 'Walgreens Market']
		],
		['stores the trimmed spelling', ['  Aldi  '], ['Aldi']],
		['keeps the order it was given', ['Zed', 'Aldi', 'Mid'], ['Zed', 'Aldi', 'Mid']]
	])('%s', (_label, stores, expected) => {
		expect(cleanGroceryStores(stores)).toEqual(expected);
	});

	it('does not mutate its input', () => {
		const stores = ['Aldi', 'aldi'];
		cleanGroceryStores(stores);
		expect(stores).toEqual(['Aldi', 'aldi']);
	});
});

describe('mostFrequentGroceryStore', () => {
	// legacy groceries.test.ts › mostFrequentStore
	it.each<[string, { store: string; count: number }[], string | null]>([
		[
			'picks the highest count',
			[
				{ store: 'Aldi', count: 2 },
				{ store: 'Kroger', count: 5 },
				{ store: 'Costco', count: 3 }
			],
			'Kroger'
		],
		[
			'ties go to the first row seen',
			[
				{ store: 'Aldi', count: 2 },
				{ store: 'Kroger', count: 5 },
				{ store: 'Costco', count: 5 }
			],
			'Kroger'
		],
		['knows nothing about no rows', [], null],
		['a single row is the answer', [{ store: 'Lidl', count: 1 }], 'Lidl'],
		['zero-count rows are not a memory', [{ store: 'Lidl', count: 0 }], null]
	])('%s', (_label, rows, expected) => {
		expect(mostFrequentGroceryStore(rows)).toBe(expected);
	});
});

describe('matchingGroceryMemoryRow', () => {
	const rows = [
		{ id: 'a', store: 'Aldi' },
		{ id: 'l', store: 'Lidl' },
		{ id: 'l2', store: 'LIDL' }
	];

	it.each<[string, string, string | null]>([
		['an exact spelling', 'Aldi', 'a'],
		['a different case', 'aldi', 'a'],
		['a padded label', '  Aldi  ', 'a'],
		['the first match wins, in row order', 'lidl', 'l'],
		['a store memory does not know is a new row', 'Costco', null],
		['a store that only contains a known one is a new row', 'Aldi Nord', null]
	])('%s', (_label, store, expectedId) => {
		expect(matchingGroceryMemoryRow(rows, store)?.id ?? null).toBe(expectedId);
	});

	it('finds nothing in empty memory', () => {
		expect(matchingGroceryMemoryRow([], 'Aldi')).toBeNull();
	});
});

describe('clampGroceryQuantity', () => {
	it.each<[string, number | undefined, number]>([
		['an absent quantity', undefined, 1],
		['one', 1, 1],
		['a larger count', 12, 12],
		['a fraction is floored', 2.9, 2],
		['a fraction below one is floored up to one', 0.5, 1],
		['zero is clamped to one', 0, 1],
		['a negative is clamped to one', -3, 1],
		['the largest quick-add quantity', 9999, 9999]
	])('%s', (_label, quantity, expected) => {
		expect(clampGroceryQuantity(quantity)).toBe(expected);
	});
});

describe('matchesGrocerySearch', () => {
	const item = (name: string, stores: string[]) => ({ name, stores });

	// legacy groceries.test.ts › matchesGrocerySearch
	it.each<[string, { name: string; stores: string[] }, string, boolean]>([
		['the item name', item('Oat milk', []), 'oat', true],
		['the item name in any case', item('Oat milk', []), 'MILK', true],
		['the store, which the tasks-page idiom does too', item('Lemons', ['Aldi', 'Kroger']), 'aldi', true],
		['an alternate store', item('Lemons', ['Aldi', 'Kroger']), 'kroger', true],
		['a storeless item on its name alone', item('Dish soap', []), 'soap', true],
		['an empty query matches everything', item('Eggs', []), '', true],
		['a blank query matches everything', item('Eggs', []), '   ', true],
		['a query is trimmed', item('Eggs', ['Aldi']), '  aldi  ', true],
		['a query hitting neither is rejected', item('Eggs', ['Aldi']), 'zzzz', false],
		['a storeless item is not found by a store query', item('Eggs', []), 'aldi', false]
	])('%s', (_label, candidate, query, expected) => {
		expect(matchesGrocerySearch(candidate, query)).toBe(expected);
	});
});

describe('grocerySuggestionName', () => {
	// Legacy `if (url.searchParams.get('suggest') && isString(name))`.
	it.each<[string, { suggest?: string | null; name?: string | null }, string | null]>([
		['suggest and a name ask for a suggestion', { suggest: '1', name: 'milk' }, 'milk'],
		['any non-empty suggest counts, even "0"', { suggest: '0', name: 'milk' }, 'milk'],
		['an empty suggest asks for nothing', { suggest: '', name: 'milk' }, null],
		['no suggest ignores the name', { name: 'milk' }, null],
		['a null suggest ignores the name', { suggest: null, name: 'milk' }, null],
		['suggest without a name is the plain list', { suggest: '1' }, null],
		['suggest with a null name is the plain list', { suggest: '1', name: null }, null],
		['an empty name is still a suggest read', { suggest: '1', name: '' }, '']
	])('%s', (_label, query, expected) => {
		expect(grocerySuggestionName(query)).toBe(expected);
	});
});

describe('groceryChangeOf', () => {
	it.each<[string, Parameters<typeof groceryChangeOf>[0], GroceryChange | null]>([
		['check', { op: 'check' }, { op: 'check' }],
		['uncheck', { op: 'uncheck' }, { op: 'uncheck' }],
		['check ignores a stray stores field', { op: 'check', stores: ['Aldi'] }, { op: 'check' }],
		['stores with a list', { op: 'stores', stores: ['Aldi', 'Lidl'] }, { op: 'stores', stores: ['Aldi', 'Lidl'] }],
		// Q-037: an empty list is a real op that clears every store on the row.
		['stores with an empty list clears the stores', { op: 'stores', stores: [] }, { op: 'stores', stores: [] }],
		[
			'stores drops non-string entries, never a 400',
			{ op: 'stores', stores: ['Aldi', 3, null, 'Lidl'] },
			{ op: 'stores', stores: ['Aldi', 'Lidl'] }
		],
		[
			'stores is not cleaned here: that is the write path',
			{ op: 'stores', stores: [' Aldi ', 'aldi'] },
			{ op: 'stores', stores: [' Aldi ', 'aldi'] }
		],
		['stores that is a single string is not a list', { op: 'stores', stores: 'Aldi' }, null],
		['stores without a stores field', { op: 'stores' }, null],
		['move to mine', { op: 'move', target: 'mine' }, { op: 'move', target: 'mine' }],
		['move to family', { op: 'move', target: 'family' }, { op: 'move', target: 'family' }],
		['move to all is not a wire scope', { op: 'move', target: 'all' }, null],
		['move to a different case', { op: 'move', target: 'Family' }, null],
		['move without a target', { op: 'move' }, null],
		['an unknown op', { op: 'delete' }, null],
		['a different case', { op: 'Check' }, null],
		['an absent op', {}, null],
		['a non-string op', { op: 1 }, null]
	])('%s', (_label, body, expected) => {
		expect(groceryChangeOf(body)).toEqual(expected);
	});
});
