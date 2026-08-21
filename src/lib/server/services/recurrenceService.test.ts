import { describe, it, expect } from 'vitest';
import { expandRecurrence, type RecurringEventInput } from './recurrenceService';

const d = (iso: string) => new Date(iso);

describe('expandRecurrence', () => {
	it('returns single occurrence for non-recurring event', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-10T18:00:00Z',
			recurrenceFrequency: null,
			recurrenceInterval: null
		};
		const result = expandRecurrence(event, d('2026-08-01T00:00:00Z'), d('2026-09-01T00:00:00Z'));
		expect(result).toHaveLength(1);
		expect(result[0].toISOString()).toBe('2026-08-10T18:00:00.000Z');
	});

	it('expands daily events every day', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-10T18:00:00Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1
		};
		const result = expandRecurrence(event, d('2026-08-10T00:00:00Z'), d('2026-08-14T00:00:00Z'));
		expect(result.map(r => r.getUTCDate())).toEqual([10, 11, 12, 13]);
	});

	it('expands weekly events every N weeks', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-03T18:00:00Z', // Monday
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2
		};
		const result = expandRecurrence(event, d('2026-08-01T00:00:00Z'), d('2026-09-15T00:00:00Z'));
		expect(result.map(r => r.toISOString().slice(0, 10))).toEqual([
			'2026-08-03',
			'2026-08-17',
			'2026-08-31',
			'2026-09-14'
		]);
	});

	it('clamps monthly day-of-month (Jan 31 -> Feb 28)', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-01-31T18:00:00Z',
			recurrenceFrequency: 'monthly',
			recurrenceInterval: 1
		};
		const result = expandRecurrence(event, d('2026-01-01T00:00:00Z'), d('2026-05-01T00:00:00Z'));
		expect(result.map(r => r.toISOString().slice(0, 10))).toEqual([
			'2026-01-31',
			'2026-02-28',
			'2026-03-31',
			'2026-04-30'
		]);
	});

	it('expands yearly events preserving month and day', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2024-02-29T18:00:00Z', // leap day
			recurrenceFrequency: 'yearly',
			recurrenceInterval: 1
		};
		const result = expandRecurrence(event, d('2024-01-01T00:00:00Z'), d('2027-06-01T00:00:00Z'));
		expect(result.map(r => r.toISOString().slice(0, 10))).toEqual([
			'2024-02-29',
			'2025-03-01', // clamped from Feb 29
			'2026-03-01',
			'2027-03-01'
		]);
	});

	it('treats null interval as 1', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-10T18:00:00Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: null
		};
		const result = expandRecurrence(event, d('2026-08-10T00:00:00Z'), d('2026-08-13T00:00:00Z'));
		expect(result).toHaveLength(3);
	});

	it('excludes occurrences before window start but keeps generating after', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-07-01T18:00:00Z',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1
		};
		const result = expandRecurrence(event, d('2026-08-01T00:00:00Z'), d('2026-08-20T00:00:00Z'));
		expect(result.map(r => r.toISOString().slice(0, 10))).toEqual([
			'2026-08-05',
			'2026-08-12',
			'2026-08-19'
		]);
	});

	it('caps runaway expansion at 500 occurrences', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2020-01-01T18:00:00Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1
		};
		const result = expandRecurrence(event, d('2020-01-01T00:00:00Z'), d('2030-01-01T00:00:00Z'));
		expect(result.length).toBeLessThanOrEqual(500);
	});
});
