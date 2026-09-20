import { describe, it, expect } from 'vitest';
import {
	normalizeGroceryName,
	parseGroceryQuickAdd,
	groupGroceriesByStore,
	mostFrequentStore
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
});
