/**
 * The picker's distinct labels (Q-082).
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect, it } from 'vitest';
import { calendarDistinctNames } from './calendar.choices.rules';

describe('calendarDistinctNames', () => {
	it.each<{ title: string; names: string[]; expected: string[] }>([
		{ title: 'leaves distinct names alone', names: ['Personal Calendar', 'Riveras'], expected: ['Personal Calendar', 'Riveras'] },
		{
			title: 'numbers a repeated label from 2, keeping the first as is (Q-082)',
			names: ['Personal Calendar', 'Personal Calendar', 'Personal Calendar'],
			expected: ['Personal Calendar', 'Personal Calendar 2', 'Personal Calendar 3']
		},
		{
			title: 'counts each label on its own',
			names: ['Riveras', 'Personal Calendar', 'Riveras'],
			expected: ['Riveras', 'Personal Calendar', 'Riveras 2']
		},
		{ title: 'answers nothing for nothing', names: [], expected: [] }
	])('$title', ({ names, expected }) => {
		expect(calendarDistinctNames(names)).toEqual(expected);
	});
});
