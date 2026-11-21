import { describe, it, expect } from 'vitest';
import { hashName } from './hashName';
import { getContactColor } from './contactColors';
import { defaultGroceryStoreColour } from '$lib/domains/groceries';

describe('hashName', () => {
	it('is deterministic for the same name', () => {
		expect(hashName('Aldi')).toBe(hashName('Aldi'));
	});

	it('is not a constant: different names hash differently in general', () => {
		expect(hashName('Aldi')).not.toBe(hashName('Costco'));
	});

	it('drives contact colours that stay put for the same name', () => {
		expect(getContactColor('Aldi')).toEqual(getContactColor('Aldi'));
	});

	it('drives the same default store colour for the same name under any spelling', () => {
		expect(defaultGroceryStoreColour('  ALDI ').key).toBe(defaultGroceryStoreColour('Aldi').key);
	});
});
