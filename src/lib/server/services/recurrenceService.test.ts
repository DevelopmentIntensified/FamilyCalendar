import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
	expandRecurrence,
	scheduleStep,
	type RecurrenceFrequency,
	type RecurringEventInput
} from './recurrenceService';

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
		expect(result.map((r) => r.getUTCDate())).toEqual([10, 11, 12, 13]);
	});

	it('expands weekly events every N weeks', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-03T18:00:00Z', // Monday
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2
		};
		const result = expandRecurrence(event, d('2026-08-01T00:00:00Z'), d('2026-09-15T00:00:00Z'));
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual([
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
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual([
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
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual([
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
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual([
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
		expect(result).toHaveLength(500);
		expect(result[0].toISOString()).toBe('2020-01-01T18:00:00.000Z');
		expect(result[499].toISOString()).toBe('2021-05-14T18:00:00.000Z');
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
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual([
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
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual([
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
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual([
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
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual([
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
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual(['2026-09-08']);
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
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual(['2026-08-10', '2026-08-17']);
	});

	it('stops weekly expansion at recurrenceUntil', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-10T18:00:00Z', // Monday
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceUntil: '2026-08-20T00:00:00.000Z'
		};
		const result = expandRecurrence(event, d('2026-08-01T00:00:00Z'), d('2026-09-15T00:00:00Z'));
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual(['2026-08-10', '2026-08-17']);
	});

	it('honors recurrenceUntil for BYDAY weekly series', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2026-08-25T10:00:00Z', // Tuesday
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceByDay: ['TU', 'TH'],
			recurrenceUntil: '2026-09-05T00:00:00.000Z'
		};
		const result = expandRecurrence(event, d('2026-08-25T00:00:00Z'), d('2026-09-30T00:00:00Z'));
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual([
			'2026-08-25', // Tue
			'2026-08-27', // Thu
			'2026-09-01', // Tue
			'2026-09-03' // Thu — next Tue (9/8) is after UNTIL
		]);
	});
});

describe('MAX_OCCURRENCES counts only in-window occurrences (old series keep expanding)', () => {
	const windowStart = d('2026-08-01T00:00:00Z');
	const windowEnd = d('2026-09-01T00:00:00Z');

	const table: {
		name: string;
		event: RecurringEventInput;
		expectedDates: string[];
	}[] = [
		{
			// ~590 daily occurrences pass before the window opens; the old cap
			// burned out on those and the series silently stopped expanding.
			name: 'daily series started 600 days before the window',
			event: {
				id: 'e1',
				start: '2024-12-19T18:00:00Z',
				recurrenceFrequency: 'daily',
				recurrenceInterval: 1
			},
			expectedDates: Array.from(
				{ length: 31 },
				(_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`
			)
		},
		{
			name: 'plain weekly series started 600 days before the window',
			event: {
				id: 'e1',
				start: '2024-12-19T18:00:00Z', // Thursday
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1
			},
			expectedDates: ['2026-08-06', '2026-08-13', '2026-08-20', '2026-08-27']
		},
		{
			name: 'Mon–Fri BYDAY series started ~2 years before the window',
			event: {
				id: 'e1',
				start: '2024-12-19T18:00:00Z', // Thursday
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceByDay: ['MO', 'TU', 'WE', 'TH', 'FR']
			},
			expectedDates: [
				'2026-08-03',
				'2026-08-04',
				'2026-08-05',
				'2026-08-06',
				'2026-08-07',
				'2026-08-10',
				'2026-08-11',
				'2026-08-12',
				'2026-08-13',
				'2026-08-14',
				'2026-08-17',
				'2026-08-18',
				'2026-08-19',
				'2026-08-20',
				'2026-08-21',
				'2026-08-24',
				'2026-08-25',
				'2026-08-26',
				'2026-08-27',
				'2026-08-28',
				'2026-08-31'
			]
		}
	];

	for (const { name, event, expectedDates } of table) {
		it(name, () => {
			const result = expandRecurrence(event, windowStart, windowEnd);
			expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual(expectedDates);
		});
	}

	it('COUNT stays series-total: 610 daily occurrences with 590 pre-window leave 20 in-window', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2024-12-19T18:00:00Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			recurrenceCount: 610
		};
		const result = expandRecurrence(event, windowStart, windowEnd);
		expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual(
			Array.from({ length: 20 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)
		);
	});

	it('COUNT stays series-total: a fully pre-window COUNT series yields nothing', () => {
		const event: RecurringEventInput = {
			id: 'e1',
			start: '2024-12-19T18:00:00Z',
			recurrenceFrequency: 'daily',
			recurrenceInterval: 1,
			recurrenceCount: 590 // exactly the occurrences before 2026-08-01
		};
		const result = expandRecurrence(event, windowStart, windowEnd);
		expect(result).toHaveLength(0);
	});
});

describe('date-only recurrenceUntil is an INCLUSIVE end-of-day cutoff', () => {
	// NLP quick-add ("every monday until Sep 7") stores `yyyy-MM-dd`. A
	// midnight-UTC cutoff silently dropped the until day's own occurrence.
	const cases: {
		name: string;
		event: RecurringEventInput;
		window: [Date, Date];
		expected: string[];
	}[] = [
		{
			name: 'BYDAY weekly: "every monday until 2026-09-07" keeps the Sep 7 evening occurrence',
			event: {
				id: 'e1',
				start: '2026-08-31T18:00:00Z', // Monday, 6 PM UTC
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceByDay: ['MO'],
				recurrenceUntil: '2026-09-07'
			},
			window: [d('2026-09-01T00:00:00Z'), d('2026-10-01T00:00:00Z')],
			expected: ['2026-09-07']
		},
		{
			name: 'plain frequency loop: daily until 2026-09-05 keeps all five days',
			event: {
				id: 'e2',
				start: '2026-09-01T18:00:00Z',
				recurrenceFrequency: 'daily',
				recurrenceInterval: 1,
				recurrenceUntil: '2026-09-05'
			},
			window: [d('2026-09-01T00:00:00Z'), d('2026-09-10T00:00:00Z')],
			expected: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
		},
		{
			name: 'full-timestamp until keeps its exact-instant cutoff (unchanged semantics)',
			event: {
				id: 'e3',
				start: '2026-09-01T18:00:00Z',
				recurrenceFrequency: 'daily',
				recurrenceInterval: 1,
				recurrenceUntil: '2026-09-05T00:00:00.000Z'
			},
			window: [d('2026-09-01T00:00:00Z'), d('2026-09-10T00:00:00Z')],
			expected: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']
		}
	];

	for (const c of cases) {
		it(c.name, () => {
			const result = expandRecurrence(c.event, c.window[0], c.window[1]);
			expect(result.map((r) => r.toISOString().slice(0, 10))).toEqual(c.expected);
		});
	}
});

/**
 * scheduleStep — the ONE shared frequency+interval stepping mechanism.
 * Edge table pins end-of-month semantics: monthly clamps into the short
 * month (Jan-31 family), yearly clamps Feb-29 to Feb-28 in non-leap years.
 * COMPOUNDING CAVEAT (cursor consumers): a clamped step re-anchors on the
 * clamped date — monthly from Feb-28 lands Mar-28, not Mar-31. Fixing that
 * requires storing the original anchor (see #032/#007 notes).
 */
describe('scheduleStep (shared frequency+interval stepping)', () => {
	const dt = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' });
	const cases: [string, string, RecurrenceFrequency, number, number, string][] = [
		// label, from, frequency, interval, n, expected date
		['daily is a plain day step', '2026-01-31T12:00:00Z', 'daily', 1, 1, '2026-02-01'],
		['weekly is a plain week step', '2026-01-31T12:00:00Z', 'weekly', 1, 1, '2026-02-07'],
		[
			'monthly Jan-31 clamps to Feb-28 in a non-leap year',
			'2026-01-31T12:00:00Z',
			'monthly',
			1,
			1,
			'2026-02-28'
		],
		[
			'monthly Jan-31 lands on Feb-29 in a leap year',
			'2024-01-31T12:00:00Z',
			'monthly',
			1,
			1,
			'2024-02-29'
		],
		['monthly Jan-30 clamps to Feb-28', '2026-01-30T12:00:00Z', 'monthly', 1, 1, '2026-02-28'],
		[
			'monthly every_3_months from Jan-31 lands Apr-30',
			'2026-01-31T12:00:00Z',
			'monthly',
			3,
			1,
			'2026-04-30'
		],
		[
			'monthly interval=1 n=3 equals interval=3 n=1',
			'2026-01-31T12:00:00Z',
			'monthly',
			1,
			3,
			'2026-04-30'
		],
		[
			'yearly Feb-29 clamps to Feb-28 in a non-leap year',
			'2024-02-29T12:00:00Z',
			'yearly',
			1,
			1,
			'2025-02-28'
		],
		[
			'yearly Feb-29 keeps Feb-29 in the next leap year',
			'2024-02-29T12:00:00Z',
			'yearly',
			4,
			1,
			'2028-02-29'
		],
		[
			'monthly from a clamped Feb-28 re-anchors on the 28th (documented compounding caveat)',
			'2026-02-28T12:00:00Z',
			'monthly',
			1,
			1,
			'2026-03-28'
		]
	];
	for (const [name, from, frequency, interval, n, expected] of cases) {
		it(name, () => {
			expect(scheduleStep(dt(from), frequency, interval, n).toISODate()).toBe(expected);
		});
	}

	it('throws on a frequency outside the closed set', () => {
		// SAFETY: the cast bypasses the type-level closed set on purpose —
		// this test pins the runtime validation for untyped callers.
		expect(() =>
			scheduleStep(dt('2026-01-31T12:00:00Z'), 'hourly' as RecurrenceFrequency, 1)
		).toThrow();
	});
});
