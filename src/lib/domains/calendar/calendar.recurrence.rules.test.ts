/**
 * Recurrence rules: the expansion tables carried from
 * `src/lib/server/services/recurrenceService.test.ts:9-704` and the write shape
 * from `src/lib/server/services/eventRecurrence.test.ts:10-144`. Expected
 * values are the legacy tests' own, never produced by running this code.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
	describeRecurrence,
	expandRecurrence,
	isRecurrenceFrequency,
	MAX_OCCURRENCES,
	normalizeEventRecurrence,
	RECURRENCE_FREQUENCIES,
	recurrenceUntilInstant,
	sanitizeRecurrenceByDay,
	sanitizeRecurrenceCount,
	scheduleStep,
	type EventRecurrenceInput,
	type RecurrenceFrequency,
	type RecurringEventInput
} from './calendar.recurrence.rules';

const at = (iso: string) => new Date(iso);
const dates = (list: readonly Date[]) => list.map((date) => date.toISOString().slice(0, 10));
const localDates = (list: readonly Date[], zone: string) =>
	list.map((date) => DateTime.fromJSDate(date, { zone }).toISODate());

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

describe('expandRecurrence (recurrenceService.test.ts:124-205)', () => {
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
});

describe('non-recurring events that overlap the window (recurrenceService.test.ts:516-545)', () => {
	const winStart = at('2026-11-01T00:00:00Z');
	const winEnd = at('2026-12-01T00:00:00Z');
	const once = (start: string, end: string | null): RecurringEventInput => ({
		id: 'trip',
		start,
		end,
		recurrenceFrequency: null,
		recurrenceInterval: null
	});

	it.each([
		['trip started last month, ends inside', '2026-10-15T00:00:00Z', '2026-11-10T00:00:00Z', 1],
		['spans the whole window', '2026-10-15T00:00:00Z', '2026-12-15T00:00:00Z', 1],
		['ends exactly at window start', '2026-10-31T20:00:00Z', '2026-11-01T00:00:00Z', 1],
		['ended before the window', '2026-10-15T00:00:00Z', '2026-10-31T23:00:00Z', 0],
		['starts inside the window', '2026-11-05T18:00:00Z', '2026-11-05T19:00:00Z', 1],
		['starts at window end', '2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z', 0],
		['no end, started before the window', '2026-10-31T23:00:00Z', null, 0],
		['no end, starts inside the window', '2026-11-02T09:00:00Z', null, 1]
	])('%s', (_name, start, end, expected) => {
		expect(expandRecurrence(once(start, end), winStart, winEnd)).toHaveLength(expected);
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

describe('recurrenceUntilInstant (recurrenceService.ts:226-277)', () => {
	it.each([
		['no until', { recurrenceUntil: null }, null],
		['a date-only until ends its day in the zone', { recurrenceUntil: '2026-09-05' }, '2026-09-05T23:59:59.999Z'],
		[
			'a full timestamp keeps its exact instant',
			{ recurrenceUntil: '2026-09-05T00:00:00.000Z' },
			'2026-09-05T00:00:00.000Z'
		],
		['an unparseable until is unbounded', { recurrenceUntil: 'nope' }, null]
	] satisfies [string, { recurrenceUntil: string | null }, string | null][])(
		'%s',
		(_name, event, expected) => {
			const instant = recurrenceUntilInstant(event, 'utc');
			expect(instant ? instant.toISOString() : null).toBe(expected);
		}
	);
});

describe('BYDAY weekdays are read in the viewer zone (recurrenceService.test.ts:548-643)', () => {
	it.each([
		[
			'Mon 7pm PST, weekly MO+WE lands on local Mon/Wed (anchor kept)',
			daily({
				start: '2026-11-03T03:00:00Z',
				recurrenceFrequency: 'weekly',
				recurrenceByDay: ['MO', 'WE']
			}),
			'America/Los_Angeles',
			'2026-11-01T00:00:00Z',
			'2026-11-16T00:00:00Z',
			['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11']
		],
		[
			'"every weekday at 7pm" Chicago is Mon-Fri local, not Sun-Thu',
			daily({
				start: '2026-11-03T01:00:00Z',
				recurrenceByDay: ['MO', 'TU', 'WE', 'TH', 'FR']
			}),
			'America/Chicago',
			'2026-11-01T00:00:00Z',
			'2026-11-10T06:00:00Z',
			['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09']
		],
		[
			'every-2-weeks MO+WE keeps its phase in the local week',
			daily({
				start: '2026-11-03T03:00:00Z',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 2,
				recurrenceByDay: ['MO', 'WE']
			}),
			'America/Los_Angeles',
			'2026-11-01T00:00:00Z',
			'2026-11-23T00:00:00Z',
			['2026-11-02', '2026-11-04', '2026-11-16', '2026-11-18']
		],
		[
			'east of UTC: Mon 8am Tokyo, weekly MO+FR is local Mon/Fri',
			daily({
				start: '2026-11-01T23:00:00Z',
				recurrenceFrequency: 'weekly',
				recurrenceByDay: ['MO', 'FR']
			}),
			'Asia/Tokyo',
			'2026-11-01T00:00:00Z',
			'2026-11-12T00:00:00Z',
			['2026-11-02', '2026-11-06', '2026-11-09']
		]
	])('%s', (_name, event, zone, from, to, expected) => {
		expect(localDates(expandRecurrence(event, at(from), at(to), zone), zone)).toEqual(expected);
	});

	it('no zone given keeps the UTC reading (unchanged default)', () => {
		const out = expandRecurrence(
			daily({
				start: '2026-08-03T18:00:00Z',
				recurrenceFrequency: 'weekly',
				recurrenceByDay: ['MO', 'WE']
			}),
			at('2026-08-01T00:00:00Z'),
			at('2026-08-10T00:00:00Z')
		);
		expect(localDates(out, 'UTC')).toEqual(['2026-08-03', '2026-08-05']);
	});
});

describe('date-only recurrenceUntil ends the day in the viewer zone (recurrenceService.test.ts:645-704)', () => {
	it.each([
		[
			'daily 5pm PST until 2026-11-05 keeps the Nov 5 occurrence',
			daily({
				start: '2026-11-03T01:00:00Z',
				recurrenceUntil: '2026-11-05'
			}),
			'America/Los_Angeles',
			['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']
		],
		[
			'BYDAY weekly evening in Chicago keeps the until day',
			daily({
				start: '2026-11-03T01:00:00Z',
				recurrenceFrequency: 'weekly',
				recurrenceByDay: ['MO'],
				recurrenceUntil: '2026-11-16'
			}),
			'America/Chicago',
			['2026-11-02', '2026-11-09', '2026-11-16']
		],
		[
			'east of UTC: daily 8am Tokyo until 2026-11-05 stops ON Nov 5, not Nov 6',
			daily({
				start: '2026-11-01T23:00:00Z',
				recurrenceUntil: '2026-11-05'
			}),
			'Asia/Tokyo',
			['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']
		]
	])('%s', (_name, event, zone, expected) => {
		const out = expandRecurrence(
			event,
			at('2026-11-01T00:00:00Z'),
			at('2026-12-01T00:00:00Z'),
			zone
		);
		expect(localDates(out, zone)).toEqual(expected);
	});
});

describe('scheduleStep (recurrenceService.test.ts:439-520)', () => {
	const dt = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' });

	it.each([
		['daily is a plain day step', '2026-01-31T12:00:00Z', 'daily', 1, 1, '2026-02-01'],
		['weekly is a plain week step', '2026-01-31T12:00:00Z', 'weekly', 1, 1, '2026-02-07'],
		['monthly Jan-31 clamps to Feb-28 in a non-leap year', '2026-01-31T12:00:00Z', 'monthly', 1, 1, '2026-02-28'],
		['monthly Jan-31 lands on Feb-29 in a leap year', '2024-01-31T12:00:00Z', 'monthly', 1, 1, '2024-02-29'],
		['monthly Jan-30 clamps to Feb-28', '2026-01-30T12:00:00Z', 'monthly', 1, 1, '2026-02-28'],
		['monthly every_3_months from Jan-31 lands Apr-30', '2026-01-31T12:00:00Z', 'monthly', 3, 1, '2026-04-30'],
		['monthly interval=1 n=3 equals interval=3 n=1', '2026-01-31T12:00:00Z', 'monthly', 1, 3, '2026-04-30'],
		['yearly Feb-29 clamps to Feb-28 in a non-leap year', '2024-02-29T12:00:00Z', 'yearly', 1, 1, '2025-02-28'],
		['yearly Feb-29 keeps Feb-29 in the next leap year', '2024-02-29T12:00:00Z', 'yearly', 4, 1, '2028-02-29'],
		[
			'monthly from a clamped Feb-28 re-anchors on the 28th (documented compounding caveat)',
			'2026-02-28T12:00:00Z',
			'monthly',
			1,
			1,
			'2026-03-28'
		]
	] satisfies [string, string, RecurrenceFrequency, number, number, string][])(
		'%s',
		(_name, from, frequency, interval, n, expected) => {
			expect(scheduleStep(dt(from), frequency, interval, n).toISODate()).toBe(expected);
		}
	);

	it('throws on a frequency outside the closed set', () => {
		// The cast bypasses the type-level closed set on purpose — this pins the
		// runtime validation for untyped callers.
		expect(() =>
			scheduleStep(DateTime.utc(2026, 1, 1), 'hourly' as RecurrenceFrequency, 1)
		).toThrow('Unknown recurrence frequency: hourly');
	});
});

describe('isRecurrenceFrequency (eventRecurrence.ts:59-110)', () => {
	it.each([
		['daily', true],
		['weekly', true],
		['monthly', true],
		['yearly', true],
		['DAILY', false],
		['hourly', false],
		['', false],
		[null, false]
	] satisfies [string | null, boolean][])('%j is %s', (value, expected) => {
		expect(isRecurrenceFrequency(value)).toBe(expected);
	});
});

describe('normalizeEventRecurrence (eventRecurrence.test.ts:10-131)', () => {
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
	] satisfies [string, EventRecurrenceInput, unknown][])('%s', (_name, input, expected) => {
		expect(normalizeEventRecurrence(input)).toEqual(expected);
	});
});

describe('sanitizers (eventRecurrence.test.ts:133-144)', () => {
	it('strips ordinals, uppercases and still drops junk', () => {
		expect(sanitizeRecurrenceByDay(['2tu,th', 'we', 'XX'])).toBeNull();
		expect(sanitizeRecurrenceByDay(['2tu', 'we'])).toEqual(['TU', 'WE']);
		expect(sanitizeRecurrenceByDay('MO')).toBeNull();
		expect(sanitizeRecurrenceCount(3.9)).toBe(3);
		expect(sanitizeRecurrenceCount(-1)).toBeNull();
		expect(sanitizeRecurrenceCount('4')).toBeNull();
	});
});

describe('describeRecurrence (icsImportPreview.ts:76-113)', () => {
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
