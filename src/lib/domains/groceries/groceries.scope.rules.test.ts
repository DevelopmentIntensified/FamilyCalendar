/**
 * The scope vocabulary: the page's All / Family / Mine filter, the wire's two
 * scopes and a row's own scope. Tables of input -> expected output, no setup.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	GROCERY_API_SCOPES,
	GROCERY_SCOPE_FILTERS,
	groceryScopeFromParam,
	groceryScopeOf,
	isGroceryListScope,
	type GroceryScopeFilter
} from './groceries.scope.rules';

describe('GROCERY_SCOPE_FILTERS', () => {
	it('opens on "all" — the page shows everything rather than one scope to switch away from', () => {
		expect(GROCERY_SCOPE_FILTERS[0].key).toBe('all');
	});

	it('is All / Family / Mine, in that order, with their labels', () => {
		expect(GROCERY_SCOPE_FILTERS).toEqual([
			{ key: 'all', label: 'All' },
			{ key: 'family', label: 'Family' },
			{ key: 'mine', label: 'Mine' }
		]);
	});

	it('is the API scopes plus "all", which exists only on the page', () => {
		const filterKeys = GROCERY_SCOPE_FILTERS.map((filter) => filter.key).sort();
		expect(filterKeys).toEqual([...GROCERY_API_SCOPES, 'all'].sort());
	});
});

describe('isGroceryListScope', () => {
	it.each<[string, unknown, boolean]>([
		['mine', 'mine', true],
		['family', 'family', true],
		['all (a page filter, not a wire scope)', 'all', false],
		['a different case', 'Mine', false],
		['the empty string', '', false],
		['null', null, false],
		['a number', 1, false]
	])('(%s)', (_label, value, expected) => {
		expect(isGroceryListScope(value)).toBe(expected);
	});
});

describe('groceryScopeFromParam', () => {
	it.each<[string, string | null | undefined, GroceryScopeFilter]>([
		['mine', 'mine', 'mine'],
		['family', 'family', 'family'],
		// "all" is a real answer, not junk: the parameter may say so.
		['all', 'all', 'all'],
		['junk falls back to all', 'nonsense', 'all'],
		['a different case falls back to all', 'Family', 'all'],
		['the empty string falls back to all', '', 'all'],
		['null falls back to all', null, 'all'],
		['absent falls back to all', undefined, 'all']
	])('%s', (_label, raw, expected) => {
		expect(groceryScopeFromParam(raw)).toBe(expected);
	});
});

describe('groceryScopeOf', () => {
	it.each<[string, string | null, 'mine' | 'family']>([
		// The scope is a property of the row, never of which list loaded it.
		['familyId NULL is Mine', null, 'mine'],
		['a family id is Family', 'fam1', 'family'],
		// Legacy truthiness: a falsy id reads as Mine.
		['an empty family id reads as Mine', '', 'mine']
	])('%s', (_label, familyId, expected) => {
		expect(groceryScopeOf({ familyId })).toBe(expected);
	});
});
