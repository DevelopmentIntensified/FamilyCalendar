import { describe, it, expect } from 'vitest';
import {
	normalizeEventRecurrence,
	sanitizeRecurrenceByDay,
	sanitizeRecurrenceCount
} from './eventRecurrence';

describe('normalizeEventRecurrence', () => {
	const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
		[
			'weekly with interval passes through',
			{ recurrenceFrequency: 'weekly', recurrenceInterval: 2 },
			{
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 2,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null
			}
		],
		[
			'missing interval defaults to 1',
			{ recurrenceFrequency: 'monthly' },
			{
				recurrenceFrequency: 'monthly',
				recurrenceInterval: 1,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null
			}
		],
		[
			'zero/negative interval clamps to 1, fractional floors',
			{ recurrenceFrequency: 'daily', recurrenceInterval: 0 },
			{
				recurrenceFrequency: 'daily',
				recurrenceInterval: 1,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null
			}
		],
		[
			'unknown frequency clears every recurrence field',
			{
				recurrenceFrequency: 'minutely',
				recurrenceInterval: 3,
				recurrenceByDay: ['MO'],
				recurrenceCount: 5,
				recurrenceUntil: '2026-12-01T00:00:00.000Z'
			},
			{
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null
			}
		],
		[
			'absent frequency clears every recurrence field',
			{ recurrenceFrequency: null, recurrenceByDay: ['FR'], recurrenceCount: 4 },
			{
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null
			}
		],
		[
			'full ICS-style shape survives intact',
			{
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceByDay: ['MO', 'WE', 'FR'],
				recurrenceCount: 76,
				recurrenceUntil: '2026-12-01T00:00:00.000Z'
			},
			{
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceByDay: ['MO', 'WE', 'FR'],
				recurrenceCount: 76,
				recurrenceUntil: '2026-12-01T00:00:00.000Z'
			}
		],
		[
			'byDay junk is filtered, empty set becomes null',
			{ recurrenceFrequency: 'weekly', recurrenceByDay: ['MO', 'XX', 'funday'] },
			{
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceByDay: ['MO'],
				recurrenceCount: null,
				recurrenceUntil: null
			}
		],
		[
			'non-positive count becomes null, fractional floors',
			{ recurrenceFrequency: 'weekly', recurrenceCount: 0 },
			{
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null
			}
		],
		[
			'empty-string until becomes null',
			{ recurrenceFrequency: 'weekly', recurrenceUntil: '' },
			{
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null
			}
		]
	];

	for (const [name, input, expected] of cases) {
		it(name, () => {
			expect(normalizeEventRecurrence(input)).toEqual(expected);
		});
	}
});

describe('sanitizeRecurrenceByDay', () => {
	it('keeps plain weekday codes, uppercases, strips ordinal prefixes, drops the rest', () => {
		expect(sanitizeRecurrenceByDay(['MO', 'we', 'XX', '2TU'])).toEqual(['MO', 'WE', 'TU']);
	});
	it('returns null for empty / non-array input', () => {
		expect(sanitizeRecurrenceByDay([])).toBeNull();
		expect(sanitizeRecurrenceByDay(null)).toBeNull();
		expect(sanitizeRecurrenceByDay('MO')).toBeNull();
	});
});

describe('sanitizeRecurrenceCount', () => {
	it('floors positive numbers, rejects the rest', () => {
		expect(sanitizeRecurrenceCount(16)).toBe(16);
		expect(sanitizeRecurrenceCount(2.9)).toBe(2);
		expect(sanitizeRecurrenceCount(0)).toBeNull();
		expect(sanitizeRecurrenceCount(-3)).toBeNull();
		expect(sanitizeRecurrenceCount('16')).toBeNull();
		expect(sanitizeRecurrenceCount(null)).toBeNull();
	});
});
