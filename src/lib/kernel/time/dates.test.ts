import { describe, expect, it } from 'vitest';
import {
	addMonthsClamped,
	dayKey,
	formatClockTime,
	formatDateTimeMinute,
	formatDayMonth,
	formatLongDate,
	formatShortDate,
	formatUsDate,
	groupByDay,
	isValidZone,
	relativeFromNow,
	startOfDayIn,
	toInstantString
} from './dates';

const NOW = '2026-11-11T12:00:00.000Z';

describe('formatters', () => {
	it.each([
		['2026-11-11T09:30:00Z', 'UTC', '11-11-2026'],
		['2026-11-11', 'America/New_York', '11-11-2026'],
		// UTC+14: local midday is already the next day.
		['2026-11-11T12:00:00Z', 'Pacific/Kiritimati', '11-12-2026'],
		['', 'UTC', ''],
		['not a date', 'UTC', ''],
		['2026-02-30', 'UTC', '']
	])('formatUsDate(%j, %s) → %j', (instant, zone, expected) => {
		expect(formatUsDate(instant, zone)).toBe(expected);
	});

	it.each([
		['2026-11-11T21:30:00Z', 'UTC', '9:30 PM'],
		['2026-11-11T00:00:00Z', 'UTC', '12:00 AM'],
		['2026-11-11T12:00:00Z', 'UTC', '12:00 PM'],
		// New York springs forward at 02:00 EST (07:00Z) on 2026-03-08.
		['2026-03-08T07:30:00Z', 'America/New_York', '3:30 AM'],
		// New York falls back at 02:00 EDT (06:00Z) on 2026-11-01: 1:30 twice.
		['2026-11-01T05:30:00Z', 'America/New_York', '1:30 AM'],
		['2026-11-01T06:30:00Z', 'America/New_York', '1:30 AM'],
		// London springs forward at 01:00Z on 2026-03-29.
		['2026-03-29T00:30:00Z', 'Europe/London', '12:30 AM'],
		['2026-03-29T01:30:00Z', 'Europe/London', '2:30 AM'],
		// London falls back at 01:00Z on 2026-10-25: 1:30 twice.
		['2026-10-25T00:30:00Z', 'Europe/London', '1:30 AM'],
		['2026-10-25T01:30:00Z', 'Europe/London', '1:30 AM'],
		['', 'UTC', '']
	])('formatClockTime(%j, %s) → %j', (instant, zone, expected) => {
		expect(formatClockTime(instant, zone)).toBe(expected);
	});

	it.each([
		['2026-11-11T09:30:00Z', NOW, 'America/New_York', 'Nov 11'],
		['2025-11-11T09:30:00Z', NOW, 'America/New_York', 'Nov 11, 2025'],
		// 03:00Z on 1 Jan is still 31 Dec in New York, so the year differs.
		['2026-01-01T03:00:00Z', '2026-01-01T12:00:00Z', 'America/New_York', 'Dec 31, 2025'],
		['2026-09-05T12:00:00Z', NOW, 'UTC', 'Sep 5'],
		['', NOW, 'UTC', '']
	])('formatDayMonth(%j, …) → %j', (instant, now, zone, expected) => {
		expect(formatDayMonth(instant, now, zone)).toBe(expected);
	});

	it.each([
		['2026-09-05T12:00:00Z', NOW, 'UTC', 'Sat, Sep 5'],
		['2026-09-05T12:00:00Z', '2027-01-01T00:00:00Z', 'UTC', 'Sat, Sep 5, 2026'],
		['2026-11-11T12:00:00Z', NOW, 'UTC', 'Wed, Nov 11'],
		['bad', NOW, 'UTC', '']
	])('formatShortDate(%j, …) → %j', (instant, now, zone, expected) => {
		expect(formatShortDate(instant, now, zone)).toBe(expected);
	});

	it.each([
		['2026-11-11T09:30:00Z', 'UTC', 'November 11, 2026'],
		['2026-11-11', 'America/New_York', 'November 11, 2026'],
		['', 'UTC', '']
	])('formatLongDate(%j, %s) → %j', (instant, zone, expected) => {
		expect(formatLongDate(instant, zone)).toBe(expected);
	});

	it.each([
		['2026-11-11T09:30:00Z', 'UTC', '2026-11-11 09:30'],
		['2026-11-11T23:30:00Z', 'Europe/London', '2026-11-11 23:30'],
		['2026-11-11T12:00:00Z', 'Pacific/Kiritimati', '2026-11-12 02:00'],
		['', 'UTC', '']
	])('formatDateTimeMinute(%j, %s) → %j', (instant, zone, expected) => {
		expect(formatDateTimeMinute(instant, zone)).toBe(expected);
	});

	it('reads a bare YYYY-MM-DD as that day in the zone', () => {
		expect(dayKey('2026-11-11', 'Pacific/Kiritimati')).toBe('2026-11-11');
		expect(formatDayMonth('2026-11-11', '2026-11-11T12:00:00Z', 'Pacific/Kiritimati')).toBe(
			'Nov 11'
		);
	});

	it('returns empty strings for an unknown zone', () => {
		expect(dayKey('2026-11-11T09:30:00Z', 'Not/AZone')).toBe('');
		expect(formatClockTime('2026-11-11T09:30:00Z', 'Not/AZone')).toBe('');
		expect(formatLongDate('2026-11-11T09:30:00Z', 'Not/AZone')).toBe('');
	});
});

describe('day keys and grouping', () => {
	it.each([
		['2026-11-11T09:30:00Z', 'UTC', '2026-11-11'],
		['2026-11-11T09:59:00Z', 'Pacific/Kiritimati', '2026-11-11'],
		// UTC+14: 10:00Z is local midnight, so the day has turned over.
		['2026-11-11T10:00:00Z', 'Pacific/Kiritimati', '2026-11-12'],
		['2026-11-11T12:00:00Z', 'Pacific/Kiritimati', '2026-11-12'],
		// New York: 04:30Z is still the previous evening (EST), 07:30Z is EDT.
		['2026-03-08T04:30:00Z', 'America/New_York', '2026-03-07'],
		['2026-03-08T07:30:00Z', 'America/New_York', '2026-03-08'],
		['2026-11-01T05:30:00Z', 'America/New_York', '2026-11-01'],
		// London: 23:30Z on 24 Oct is already 00:30 BST on 25 Oct.
		['2026-10-24T23:30:00Z', 'Europe/London', '2026-10-25'],
		['2026-03-29T00:30:00Z', 'Europe/London', '2026-03-29'],
		['2026-02-30', 'UTC', ''],
		['', 'UTC', '']
	])('dayKey(%j, %s) → %j', (instant, zone, expected) => {
		expect(dayKey(instant, zone)).toBe(expected);
	});

	it('groups in zone order of first appearance and skips invalid instants', () => {
		const items = [
			{ id: 'a', at: '2026-11-12T03:00:00Z' },
			{ id: 'b', at: null },
			{ id: 'c', at: '2026-11-11T10:00:00Z' },
			{ id: 'd', at: 'nope' },
			{ id: 'e', at: new Date('2026-11-12T20:00:00Z') }
		];

		const kiritimati = groupByDay(items, (item) => item.at, 'Pacific/Kiritimati');
		expect([...kiritimati.keys()]).toEqual(['2026-11-12', '2026-11-13']);
		expect(kiritimati.get('2026-11-12')?.map((item) => item.id)).toEqual(['a', 'c']);
		expect(kiritimati.get('2026-11-13')?.map((item) => item.id)).toEqual(['e']);

		const utc = groupByDay(items, (item) => item.at, 'UTC');
		expect([...utc.keys()]).toEqual(['2026-11-12', '2026-11-11']);
		expect(utc.get('2026-11-12')?.map((item) => item.id)).toEqual(['a', 'e']);
	});
});

describe('month math', () => {
	const rows: Array<[string, number, string]> = [
		['2026-01-31', 1, '2026-02-28'],
		['2028-01-31', 1, '2028-02-29'],
		['2026-03-31', -1, '2026-02-28'],
		['2028-02-29', 12, '2029-02-28'],
		['2026-12-31', 2, '2027-02-28'],
		['2026-01-31', -1, '2025-12-31'],
		['2026-11-11', 0, '2026-11-11'],
		['2026-11-11', 14, '2028-01-11'],
		['2026-11-11', -12, '2025-11-11'],
		['2026-11-31', 1, ''],
		['2026-02-29', 0, ''],
		['nonsense', 1, ''],
		['2026-11-11', 1.5, '']
	];

	it.each(rows)('addMonthsClamped(%j, %d) → %j', (date, months, expected) => {
		expect(addMonthsClamped(date, months)).toBe(expected);
	});
});

describe('relative dates', () => {
	const NEW_YORK = 'America/New_York';

	it.each([
		['2026-11-11T15:00:00Z', 'today'],
		['2026-11-12T15:00:00Z', 'in 1 day'],
		['2026-11-14T15:00:00Z', 'in 3 days'],
		['2026-11-10T15:00:00Z', '1 day ago'],
		['2026-11-01T15:00:00Z', '10 days ago'],
		['2026-10-14T15:00:00Z', '4 weeks ago'],
		['2026-09-01T15:00:00Z', '2 months ago'],
		['2027-01-11T15:00:00Z', 'in 2 months'],
		['nope', '']
	])('relativeFromNow(%j) → %j', (instant, expected) => {
		expect(relativeFromNow(instant, NOW, NEW_YORK)).toBe(expected);
	});

	it('counts calendar days in the zone, not in UTC', () => {
		// In Kiritimati 02:00Z is 16:00 on the 11th; 12:00Z is 02:00 on the 12th.
		const zone = 'Pacific/Kiritimati';
		expect(relativeFromNow('2026-11-11T12:00:00Z', '2026-11-11T02:00:00Z', zone)).toBe('in 1 day');
		expect(relativeFromNow('2026-11-11T12:00:00Z', '2026-11-11T02:00:00Z', 'UTC')).toBe('today');
	});
});

describe('zones and instants', () => {
	it.each([
		['America/New_York', '2026-03-08T12:00:00Z', '2026-03-08T05:00:00.000Z'],
		['America/New_York', '2026-11-01T12:00:00Z', '2026-11-01T04:00:00.000Z'],
		['Europe/London', '2026-03-29T12:00:00Z', '2026-03-29T00:00:00.000Z'],
		['Europe/London', '2026-10-25T12:00:00Z', '2026-10-24T23:00:00.000Z'],
		['Pacific/Kiritimati', '2026-11-11T12:00:00Z', '2026-11-11T10:00:00.000Z'],
		['UTC', '2026-11-11T09:30:00Z', '2026-11-11T00:00:00.000Z']
	])('startOfDayIn(%s, %j) → %s', (zone, instant, expected) => {
		expect(startOfDayIn(zone, instant).toISOString()).toBe(expected);
	});

	it('startOfDayIn returns an invalid Date for unknown input', () => {
		expect(Number.isNaN(startOfDayIn('Not/AZone', '2026-11-11T09:30:00Z').getTime())).toBe(true);
		expect(Number.isNaN(startOfDayIn('UTC', 'nope').getTime())).toBe(true);
	});

	const zoneRows: Array<[string, boolean]> = [
		['America/New_York', true],
		['Europe/London', true],
		['Pacific/Kiritimati', true],
		['UTC', true],
		['Not/AZone', false],
		['', false]
	];

	it.each(zoneRows)('isValidZone(%j) → %s', (zone, expected) => {
		expect(isValidZone(zone)).toBe(expected);
	});

	const instantRows: Array<[Date | string | null | undefined, string | null]> = [
		['2026-11-11T09:30:00Z', '2026-11-11T09:30:00.000Z'],
		[new Date('2026-11-11T09:30:00Z'), '2026-11-11T09:30:00.000Z'],
		['2026-11-11 09:30:00', '2026-11-11T09:30:00.000Z'],
		['2026-11-11 09:30:00+00', '2026-11-11T09:30:00.000Z'],
		['2026-11-11T09:30:00-05:00', '2026-11-11T14:30:00.000Z'],
		['2026-11-11', '2026-11-11T00:00:00.000Z'],
		[null, null],
		[undefined, null],
		['', null],
		['   ', null],
		['nope', null],
		['2026-02-30', null],
		[new Date(NaN), null]
	];

	it.each(instantRows)('toInstantString(%j) → %j', (value, expected) => {
		expect(toInstantString(value)).toBe(expected);
	});
});
