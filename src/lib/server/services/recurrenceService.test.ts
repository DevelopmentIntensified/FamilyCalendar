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

	it('accepts Date instances (drizzle/postgres.js runtime shape)', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: new Date('2026-08-10T18:00:00Z'),
			recurrenceFrequency: null,
			recurrenceInterval: null
		};
		const result = expandRecurrence(event, d('2026-08-01T00:00:00Z'), d('2026-09-01T00:00:00Z'));
		expect(result).toHaveLength(1);
	});

	it('accepts pg space-separated timestamp strings', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-10 18:00:00+00',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1
		};
		const result = expandRecurrence(event, d('2026-08-01T00:00:00Z'), d('2026-08-25T00:00:00Z'));
		expect(result.map(r => r.toISOString().slice(0, 10))).toEqual([
			'2026-08-10',
			'2026-08-17',
			'2026-08-24'
		]);
	});

	it('expands weekly BYDAY events only on the listed weekdays', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-24T13:00:00Z', // Monday
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceByDay: ['MO', 'WE', 'FR']
		};
		const result = expandRecurrence(event, d('2026-08-24T00:00:00Z'), d('2026-09-01T00:00:00Z'));
		expect(result.map(r => r.toISOString().slice(0, 10))).toEqual([
			'2026-08-24', // Mon
			'2026-08-26', // Wed
			'2026-08-28', // Fri
			'2026-08-31' // Mon
		]);
	});

	it('expands weekly BYDAY events respecting INTERVAL (every Nth week)', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-25T10:00:00Z', // Tuesday
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2,
			recurrenceByDay: ['TU', 'TH']
		};
		const result = expandRecurrence(event, d('2026-08-25T00:00:00Z'), d('2026-09-30T00:00:00Z'));
		expect(result.map(r => r.toISOString().slice(0, 10))).toEqual([
			'2026-08-25', // Tue, week 0
			'2026-08-27', // Thu, week 0
			'2026-09-08', // Tue, week 2
			'2026-09-10', // Thu, week 2
			'2026-09-22', // Tue, week 4
			'2026-09-24' // Thu, week 4
		]);
	});

	it('respects recurrenceCount and stops the series after COUNT occurrences', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-25T10:00:00Z', // Tuesday
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceByDay: ['TU'],
			recurrenceCount: 3
		};
		const result = expandRecurrence(event, d('2026-08-25T00:00:00Z'), d('2026-10-01T00:00:00Z'));
		expect(result.map(r => r.toISOString().slice(0, 10))).toEqual([
			'2026-08-25',
			'2026-09-01',
			'2026-09-08'
		]);
	});

	it('applies recurrenceCount across the whole series even when a window starts later', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-25T10:00:00Z', // Tuesday
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceByDay: ['TU'],
			recurrenceCount: 2 // only 2 Tuesdays total -> 8/25 and 9/1
		};
		// Window opens on 9/8; both occurrences are already consumed.
		const result = expandRecurrence(event, d('2026-09-08T00:00:00Z'), d('2026-10-01T00:00:00Z'));
		expect(result).toHaveLength(0);
	});

	it('emits the tail of a COUNT-limited series inside a later window', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-25T10:00:00Z', // Tuesday
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceByDay: ['TU'],
			recurrenceCount: 3 // three Tuesdays: 8/25, 9/1, 9/8
		};
		const result = expandRecurrence(event, d('2026-09-08T00:00:00Z'), d('2026-10-01T00:00:00Z'));
		expect(result.map(r => r.toISOString().slice(0, 10))).toEqual(['2026-09-08']);
	});

	it('applies recurrenceCount to non-BYDAY weekly events', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-10T18:00:00Z', // Monday
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 2
		};
		const result = expandRecurrence(event, d('2026-08-01T00:00:00Z'), d('2026-09-15T00:00:00Z'));
		expect(result.map(r => r.toISOString().slice(0, 10))).toEqual([
			'2026-08-10',
			'2026-08-17'
		]);
	});
});
