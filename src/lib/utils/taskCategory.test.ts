import { describe, it, expect } from 'vitest';
import {
	CATEGORY_MAX,
	normalizeCategoryInput,
	categoryNameError,
	renameInList,
	removeFromList
} from './taskCategory';

describe('normalizeCategoryInput', () => {
	const cases: [string, string | null][] = [
		['', null],
		['   ', null],
		['Work', 'Work'],
		['  Deep Work  ', 'Deep Work'],
		['\tHome\n', 'Home']
	];
	for (const [raw, want] of cases) {
		it(`${JSON.stringify(raw)} -> ${JSON.stringify(want)}`, () => {
			expect(normalizeCategoryInput(raw)).toBe(want);
		});
	}
});

describe('categoryNameError', () => {
	it('flags blank and too long, passes normal names', () => {
		expect(categoryNameError('  ')).toBe('Name is required');
		expect(categoryNameError('x'.repeat(CATEGORY_MAX + 1))).toBe(
			`Keep it to ${CATEGORY_MAX} characters`
		);
		expect(categoryNameError(` ${'x'.repeat(CATEGORY_MAX)} `)).toBeNull();
		expect(categoryNameError('Work')).toBeNull();
	});
});

describe('list helpers', () => {
	const list = [
		{ id: 'a', name: 'Errands' },
		{ id: 'b', name: 'Work' }
	];
	it('renames in place and re-sorts case-insensitively', () => {
		expect(renameInList(list, 'b', 'admin')).toEqual([
			{ id: 'b', name: 'admin' },
			{ id: 'a', name: 'Errands' }
		]);
		// Input untouched (rollback relies on the old array).
		expect(list[1].name).toBe('Work');
	});
	it('removes by id', () => {
		expect(removeFromList(list, 'a')).toEqual([{ id: 'b', name: 'Work' }]);
		expect(removeFromList(list, 'zz')).toEqual(list);
	});
});
