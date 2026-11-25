/**
 * The merge prompt's pure rules: the count copy, the primary button's label
 * and which sentence shape the prompt uses.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { mergeBringLabel, mergeCountLabel, mergeSentenceKind } from './access.merge.rules';

describe('merge prompt copy', () => {
	it('pluralises a count', () => {
		expect(mergeCountLabel(1, 'event')).toBe('1 event');
		expect(mergeCountLabel(3, 'event')).toBe('3 events');
		expect(mergeCountLabel(1, 'task')).toBe('1 task');
		expect(mergeCountLabel(2, 'task')).toBe('2 tasks');
	});

	it('counts both kinds in the primary button', () => {
		expect(mergeBringLabel(3, 2)).toBe('Bring my 5 items over');
		expect(mergeBringLabel(0, 1)).toBe('Bring my 1 items over');
	});

	it.each([
		[2, 1, 'both'],
		[1, 0, 'events'],
		[0, 4, 'tasks']
	])('events %s / tasks %s uses the %s sentence', (events, tasks, expected) => {
		expect(mergeSentenceKind(events, tasks)).toBe(expected);
	});
});
