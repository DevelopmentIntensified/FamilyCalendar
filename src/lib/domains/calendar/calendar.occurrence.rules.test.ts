/**
 * Recurrence + occurrence rules: expansion tables carried from
 * `recurrenceService.test.ts` and `eventIds.test.ts`, plus the write shape from
 * `eventRecurrence.test.ts`. Expected values are the legacy tests' own, never
 * produced by running this code.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
	describeRecurrence,
	expandRecurrence,
	MAX_OCCURRENCES,
	normalizeEventRecurrence,
	RECURRENCE_FREQUENCIES,
	sanitizeRecurrenceByDay,
	sanitizeRecurrenceCount,
	scheduleStep,
	type RecurrenceFrequency,
	type RecurringEventInput
} from './calendar.recurrence.rules';
import {
	buildOccurrenceId,
	expandEventOccurrences,
	normalizeOccurrenceIso,
	resolveMasterId,
	resolveOccurrenceId,
	shiftException
} from './calendar.occurrence.rules';

const at = (iso: string) => new Date(iso);
const dates = (list: readonly Date[]) => list.map((date) => date.toISOString().slice(0, 10));

const daily = (over: Partial<RecurringEventInput> = {}): RecurringEventInput => ({
	id: 'evt12345678901',
	start: '2026-08-10T18:00:00Z',
	recurrenceFrequency: 'daily',
	recurrenceInterval: 1,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	...over
});

describe('expandRecurrence', () => {
	it('returns the single occurrence of a non-recurring event', () => {
		const result = expandRecurrence(
			daily({ recurrenceFrequency: null, recurrenceInterval: null }),
			at('2026-08-01T00:00:00Z'),
			at('2026-09-01T00:00:00Z')
		);
		expect(result.map((date) => date.toISOString())).toEqual(['2026-08-10T18:00:00.000Z']);
	});

	it.each([
		[
			'daily every day',
			daily(),
			'2026-08-10T00:00:00Z',
			'2026-08-14T00:00:00Z',
			['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13']
		],
		[
			'weekly every 2 weeks',
			daily({ start: '2026-08-03T18:00:00Z', recurrenceFrequency: 'weekly', recurrenceInterval: 2 }),
			'2026-08-01T00:00:00Z',
			'2026-09-15T00:00:00Z',
			['2026-08-03', '2026-08-17', '2026-08-31', '2026-09-14']
		],
		[
			'monthly clamps into the short month (Jan 31 -> Feb 28)',
			daily({ start: '2026-01-31T18:00:00Z', recurrenceFrequency: 'monthly' }),
			'2026-01-01T00:00:00Z',
			'2026-05-01T00:00:00Z',
			['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']
		],
		[
			'yearly Feb 29 rolls forward to Mar 1',
			daily({ start: '2024-02-29T18:00:00Z', recurrenceFrequency: 'yearly' }),
			'2024-01-01T00:00:00Z',
			'2027-06-01T00:00:00Z',
			['2024-02-29', '2025-03-01', '2026-03-01', '2027-03-01']
		],
		[
			'excludes occurrences before the window but keeps generating after',
			daily({ start: '2026-07-01T18:00:00Z', recurrenceFrequency: 'weekly' }),
			'2026-08-01T00:00:00Z',
			'2026-08-20T00:00:00Z',
			['2026-08-05', '2026-08-12', '2026-08-19']
		],
		[
			'accepts pg space-separated timestamps',
			daily({ start: '2026-08-10 18:00:00+00', recurrenceFrequency: 'weekly' }),
			'2026-08-01T00:00:00Z',
			'2026-08-25T00:00:00Z',
			['2026-08-10', '2026-08-17', '2026-08-24']
		],
		[
			'weekly BYDAY only on the listed weekdays',
			daily({ start: '2026-08-24T13:00:00Z', recurrenceFrequency: 'weekly', recurrenceByDay: ['MO', 'WE', 'FR'] }),
			'2026-08-24T00:00:00Z',
			'2026-09-01T00:00:00Z',
			['2026-08-24', '2026-08-26', '2026-08-28', '2026-08-31']
		],
		[
			'weekly BYDAY respects INTERVAL',
			daily({
				start: '2026-08-25T10:00:00Z',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 2,
				recurrenceByDay: ['TU', 'TH']
			}),
			'2026-08-25T00:00:00Z',
			'2026-09-30T00:00:00Z',
			['2026-08-25', '2026-08-27', '2026-09-08', '2026-09-10', '2026-09-22', '2026-09-24']
		],
		[
			'COUNT stops the series after 3',
			daily({
				start: '2026-08-25T10:00:00Z',
				recurrenceFrequency: 'weekly',
				recurrenceByDay: ['TU'],
				recurrenceCount: 3
			}),
			'2026-08-25T00:00:00Z',
			'2026-10-01T00:00:00Z',
			['2026-08-25', '2026-09-01', '2026-09-08']
		],
		[
			'COUNT is series-total, so a later window can be empty',
			daily({
				start: '2026-08-25T10:00:00Z',
				recurrenceFrequency: 'weekly',
				recurrenceByDay: ['TU'],
				recurrenceCount: 2
			}),
			'2026-09-08T00:00:00Z',
			'2026-10-01T00:00:00Z',
			[]
		],
		[
			'a later window emits the tail of a COUNT series',
			daily({
				start: '2026-08-25T10:00:00Z',
				recurrenceFrequency: 'weekly',
				recurrenceByDay: ['TU'],
				recurrenceCount: 3
			}),
			'2026-09-08T00:00:00Z',
			'2026-10-01T00:00:00Z',
			['2026-09-08']
		],
		[
			'COUNT applies to a plain weekly series too',
			daily({ start: '2026-08-10T18:00:00Z', recurrenceFrequency: 'weekly', recurrenceCount: 2 }),
			'2026-08-01T00:00:00Z',
			'2026-09-15T00:00:00Z',
			['2026-08-10', '2026-08-17']
		],
		[
			'stops a weekly series at an exact UNTIL instant',
			daily({ recurrenceFrequency: 'weekly', recurrenceUntil: '2026-08-20T00:00:00.000Z' }),
			'2026-08-01T00:00:00Z',
			'2026-09-15T00:00:00Z',
			['2026-08-10', '2026-08-17']
		],
		[
			'honors UNTIL for a BYDAY series',
			daily({
				start: '2026-08-25T10:00:00Z',
				recurrenceFrequency: 'weekly',
				recurrenceByDay: ['TU', 'TH'],
				recurrenceUntil: '2026-09-05T00:00:00.000Z'
			}),
			'2026-08-25T00:00:00Z',
			'2026-09-30T00:00:00Z',
			['2026-08-25', '2026-08-27', '2026-09-01', '2026-09-03']
		]
	])('%s', (_name, event, from, to, expected) => {
		expect(dates(expandRecurrence(event, at(from), at(to)))).toEqual(expected);
	});

	it('treats a null interval as 1', () => {
		const result = expandRecurrence(
			daily({ recurrenceInterval: null }),
			at('2026-08-10T00:00:00Z'),
			at('2026-08-13T00:00:00Z')
		);
		expect(result).toHaveLength(3);
	});

	it('caps runaway expansion at 500 in-window occurrences', () => {
		const result = expandRecurrence(
			daily({ start: '2020-01-01T18:00:00Z' }),
			at('2020-01-01T00:00:00Z'),
			at('2030-01-01T00:00:00Z')
		);
		expect(MAX_OCCURRENCES).toBe(500);
		expect(result).toHaveLength(500);
		expect(result[0]?.toISOString()).toBe('2020-01-01T18:00:00.000Z');
		expect(result[499]?.toISOString()).toBe('2021-05-14T18:00:00.000Z');
	});

	it('keeps expanding a series that started years before the window', () => {
		// 590 occurrences pass before the window; COUNT semantics stay series-total.
		const result = expandRecurrence(
			daily({ start: '2024-12-19T18:00:00Z', recurrenceCount: 610 }),
			at('2026-08-01T00:00:00Z'),
			at('2026-09-01T00:00:00Z')
		);
		expect(result).toHaveLength(20);
		expect(result[0]?.toISOString().slice(0, 10)).toBe('2026-08-01');
	});

	it('counts a non-recurring event by overlap, not by start-in-window (#217)', () => {
		const trip = daily({
			start: '2026-08-10T00:00:00Z',
			end: '2026-08-13T00:00:00Z',
			recurrenceFrequency: null,
			recurrenceInterval: null
		});
		// Started before the window and ends inside it: shown.
		expect(expandRecurrence(trip, at('2026-08-11T00:00:00Z'), at('2026-08-12T00:00:00Z'))).toHaveLength(1);
		// Finished before the window: hidden.
		expect(expandRecurrence(trip, at('2026-08-14T00:00:00Z'), at('2026-08-20T00:00:00Z'))).toHaveLength(0);
	});
});

describe('date-only recurrenceUntil is an inclusive end-of-day cutoff', () => {
	it.each([
		[
			'BYDAY weekly keeps the until day’s evening occurrence',
			daily({
				start: '2026-08-31T18:00:00Z',
				recurrenceFrequency: 'weekly',
				recurrenceByDay: ['MO'],
				recurrenceUntil: '2026-09-07'
			}),
			['2026-08-31', '2026-09-07']
		],
		[
			'plain daily keeps all five days',
			daily({ start: '2026-09-01T18:00:00Z', recurrenceUntil: '2026-09-05' }),
			['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
		],
		[
			'a full timestamp keeps its exact cutoff',
			daily({ start: '2026-09-01T18:00:00Z', recurrenceUntil: '2026-09-05T00:00:00.000Z' }),
			['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']
		]
	])('%s', (_name, event, expected) => {
		expect(dates(expandRecurrence(event, at('2026-08-01T00:00:00Z'), at('2026-10-01T00:00:00Z')))).toEqual(
			expected
		);
	});
});

describe('scheduleStep', () => {
	it('clamps a monthly step into the short month', () => {
		const stepped = scheduleStep(DateTime.utc(2026, 1, 31, 18), 'monthly', 1);
		expect(stepped.toISODate()).toBe('2026-02-28');
		expect(stepped.hour).toBe(18);
	});

	it('throws on a frequency outside the closed set', () => {
		expect(() =>
			scheduleStep(DateTime.utc(2026, 1, 1), 'hourly' as RecurrenceFrequency, 1)
		).toThrow('Unknown recurrence frequency: hourly');
	});
});

describe('normalizeEventRecurrence', () => {
	it('keeps the four frequencies as the only vocabulary', () => {
		expect(RECURRENCE_FREQUENCIES).toEqual(['daily', 'weekly', 'monthly', 'yearly']);
	});

	it.each([
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
			'a zero interval clamps to 1',
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
			'an unknown frequency clears every field',
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
			'an absent frequency clears every field',
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
			'the full ICS-style shape survives',
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
			'byDay junk is filtered and an empty set becomes null',
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
			'a non-positive count becomes null',
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
			'a blank until becomes null',
			{ recurrenceFrequency: 'weekly', recurrenceUntil: '' },
			{
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceByDay: null,
				recurrenceCount: null,
				recurrenceUntil: null
			}
		]
	])('%s', (_name, input, expected) => {
		expect(normalizeEventRecurrence(input)).toEqual(expected);
	});
});

describe('sanitizers', () => {
	it('strips ordinals, uppercases and still drops junk', () => {
		expect(sanitizeRecurrenceByDay(['2tu,th', 'we', 'XX'])).toBeNull();
		expect(sanitizeRecurrenceByDay(['2tu', 'we'])).toEqual(['TU', 'WE']);
		expect(sanitizeRecurrenceByDay('MO')).toBeNull();
		expect(sanitizeRecurrenceCount(3.9)).toBe(3);
		expect(sanitizeRecurrenceCount(-1)).toBeNull();
		expect(sanitizeRecurrenceCount('4')).toBeNull();
	});
});

describe('describeRecurrence', () => {
	it.each([
		[
			'weekly on Mon, Wed, Fri',
			{ recurrenceFrequency: 'weekly', recurrenceInterval: 1, recurrenceByDay: ['MO', 'WE', 'FR'], recurrenceCount: null, recurrenceUntil: null },
			'every week on Mon, Wed, Fri'
		],
		[
			'every 3 months',
			{ recurrenceFrequency: 'monthly', recurrenceInterval: 3, recurrenceByDay: null, recurrenceCount: null, recurrenceUntil: null },
			'every 3 months'
		],
		[
			'count tail',
			{ recurrenceFrequency: 'daily', recurrenceInterval: 1, recurrenceByDay: null, recurrenceCount: 5, recurrenceUntil: null },
			'every day for 5 days'
		],
		[
			'until tail',
			{ recurrenceFrequency: 'weekly', recurrenceInterval: 2, recurrenceByDay: null, recurrenceCount: null, recurrenceUntil: '2026-09-07T00:00:00.000Z' },
			'every 2 weeks until Mon, Sep 7, 2026'
		],
		[
			'a one-off has no label',
			{ recurrenceFrequency: null, recurrenceInterval: null, recurrenceByDay: null, recurrenceCount: null, recurrenceUntil: null },
			null
		]
	])('%s', (_name, shape, expected) => {
		expect(describeRecurrence(shape)).toBe(expected);
	});
});

describe('occurrence ids', () => {
	it('builds the one composite shape', () => {
		expect(buildOccurrenceId('abc123def456ghi', '2026-08-21T16:00:00.000Z')).toBe(
			'abc123def456ghi~2026-08-21T16:00:00.000Z'
		);
	});

	it.each([
		['abc123def456ghi~2026-08-21T16:00:00.000Z', 'abc123def456ghi'],
		['abc123def456ghi', 'abc123def456ghi'],
		['a1b2c3d4-e5f6-7890-abcd-ef0123456789', 'a1b2c3d4-e5f6-7890-abcd-ef0123456789'],
		['', null],
		['~2026-08-21', null],
		["abc'; DROP TABLE events;--~x", null],
		[null, null]
	])('resolveMasterId(%j) -> %j', (raw, expected) => {
		expect(resolveMasterId(raw)).toBe(expected);
	});

	it('round-trips a composite id preserving ISO precision', () => {
		expect(resolveOccurrenceId('abc123def456ghi~2026-08-21T16:00:00.123Z')).toEqual({
			masterId: 'abc123def456ghi',
			occurrenceIso: '2026-08-21T16:00:00.123Z'
		});
	});

	it('resolves a non-recurring id with no occurrence part', () => {
		expect(resolveOccurrenceId('abc123def456ghi')).toEqual({ masterId: 'abc123def456ghi' });
	});

	it('normalizes an offset occurrence into UTC ISO', () => {
		expect(resolveOccurrenceId('Kx7Pq2Zr9VmT1Lw~2026-08-22T05:00:00.000+02:00')).toEqual({
			masterId: 'Kx7Pq2Zr9VmT1Lw',
			occurrenceIso: '2026-08-22T03:00:00.000Z'
		});
	});

	it.each([[''], ['~2026-08-21T00:00:00.000Z'], ['abc123def456ghi~not-an-iso'], ['abc123def456ghi~']])(
		'resolveOccurrenceId(%j) is null',
		(raw) => {
			expect(resolveOccurrenceId(raw)).toBeNull();
		}
	);

	it('normalizeOccurrenceIso matches the expansion rendering so override keying cannot drift', () => {
		const occurrences = expandRecurrence(
			daily({ start: '2026-08-22T05:00:00.000Z', recurrenceFrequency: 'weekly' }),
			at('2026-08-01T00:00:00.000Z'),
			at('2026-09-01T00:00:00.000Z')
		);
		expect(occurrences.length).toBeGreaterThan(0);
		for (const occurrence of occurrences) {
			expect(normalizeOccurrenceIso(occurrence.toISOString())).toBe(occurrence.toISOString());
			expect(normalizeOccurrenceIso(occurrence)).toBe(occurrence.toISOString());
		}
	});
});

describe('shiftException', () => {
	it('shifts the slot key and both overrides by the same delta', () => {
		expect(
			shiftException(
				{
					originalDate: '2026-10-13T15:00:00.000Z',
					start: '2026-10-13T17:00:00.000Z',
					end: '2026-10-13T18:00:00.000Z'
				},
				86_400_000
			)
		).toEqual({
			originalDate: '2026-10-14T15:00:00.000Z',
			start: '2026-10-14T17:00:00.000Z',
			end: '2026-10-14T18:00:00.000Z'
		});
	});

	it('keeps a null override null', () => {
		expect(
			shiftException({ originalDate: '2026-10-13T15:00:00.000Z', start: null, end: null }, 3_600_000)
		).toEqual({ originalDate: '2026-10-13T16:00:00.000Z', start: null, end: null });
	});
});

describe('expandEventOccurrences', () => {
	const master = {
		id: 'evtseries001',
		ownerId: 'user000000001',
		calendarId: 'calpersonal001',
		title: 'Piano',
		start: '2026-10-06T15:00:00.000Z',
		end: '2026-10-06T16:00:00.000Z',
		description: null,
		location: 'Hall',
		allDay: false,
		recurrenceFrequency: 'weekly',
		recurrenceInterval: 1,
		recurrenceByDay: null,
		recurrenceCount: 3,
		recurrenceUntil: null
	};
	const window = { start: at('2026-10-01T00:00:00.000Z'), end: at('2026-11-01T00:00:00.000Z') };

	it('drops a cancelled slot and merges an edited one over the master', () => {
		const result = expandEventOccurrences(
			[master],
			[
				{
					eventId: 'evtseries001',
					originalDate: '2026-10-20T15:00:00.000Z',
					isCancelled: true,
					title: null,
					description: null,
					location: null,
					start: null,
					end: null,
					allDay: null
				},
				{
					eventId: 'evtseries001',
					originalDate: '2026-10-13T15:00:00.000Z',
					isCancelled: false,
					title: 'Piano (moved)',
					description: null,
					location: null,
					start: '2026-10-13T17:00:00.000Z',
					end: null,
					allDay: null
				}
			],
			window
		);

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			id: 'evtseries001~2026-10-06T15:00:00.000Z',
			masterId: 'evtseries001',
			occurrenceDate: '2026-10-06T15:00:00.000Z',
			title: 'Piano'
		});
		expect(result[1]).toMatchObject({
			id: 'evtseries001~2026-10-13T15:00:00.000Z',
			occurrenceDate: '2026-10-13T15:00:00.000Z',
			start: '2026-10-13T17:00:00.000Z',
			// end derives from the master's one-hour duration
			end: '2026-10-13T18:00:00.000Z',
			title: 'Piano (moved)',
			location: 'Hall'
		});
	});

	it('keeps an override start with an explicit end', () => {
		const result = expandEventOccurrences(
			[master],
			[
				{
					eventId: 'evtseries001',
					originalDate: '2026-10-06T15:00:00.000Z',
					isCancelled: false,
					title: null,
					description: 'Bring music',
					location: null,
					start: null,
					end: '2026-10-06T19:30:00.000Z',
					allDay: null
				}
			],
			window
		);
		expect(result[0]).toMatchObject({
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T19:30:00.000Z',
			description: 'Bring music'
		});
	});
});
