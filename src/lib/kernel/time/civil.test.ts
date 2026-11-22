/**
 * The luxon-free day key, minute stamp and month shift. Rows are the ones
 * `dates.test.ts` pins for the same functions (they are re-exported there), so
 * a caller can take the cheap home without the two homes ever disagreeing.
 *
 * Doc: src/lib/kernel/README.md#time
 */
import { describe, expect, it } from 'vitest';
import { addMonthsClamped, dayKey, formatDateTimeMinute } from './civil';

describe('dayKey', () => {
	it.each<[string, string, string]>([
		['2026-11-11T09:30:00Z', 'UTC', '2026-11-11'],
		['2026-11-11T09:59:00Z', 'Pacific/Kiritimati', '2026-11-11'],
		// UTC+14: 10:00Z is local midnight, so the day has turned over.
		['2026-11-11T10:00:00Z', 'Pacific/Kiritimati', '2026-11-12'],
		['2026-03-08T04:30:00Z', 'America/New_York', '2026-03-07'],
		['2026-03-08T07:30:00Z', 'America/New_York', '2026-03-08'],
		['2026-10-24T23:30:00Z', 'Europe/London', '2026-10-25'],
		// A bare date is already its own key, in any zone that exists.
		['2026-11-11', 'Pacific/Kiritimati', '2026-11-11'],
		['2026-02-30', 'UTC', ''],
		['', 'UTC', ''],
		['2026-11-11T09:30:00Z', 'Not/AZone', '']
	])('dayKey(%j, %s) → %j', (instant, zone, expected) => {
		expect(dayKey(instant, zone)).toBe(expected);
	});

	it('accepts a Date instance', () => {
		expect(dayKey(new Date('2026-11-11T12:00:00Z'), 'Pacific/Kiritimati')).toBe('2026-11-12');
	});
});

describe('formatDateTimeMinute', () => {
	it.each<[string, string, string]>([
		['2026-11-11T09:30:00Z', 'UTC', '2026-11-11 09:30'],
		['2026-11-11T23:30:00Z', 'Europe/London', '2026-11-11 23:30'],
		['2026-11-11T12:00:00Z', 'Pacific/Kiritimati', '2026-11-12 02:00'],
		// No offset means UTC: 13:00Z is 09:00 in New York.
		['2026-10-07T13:00:00', 'America/New_York', '2026-10-07 09:00'],
		['2026-10-07 13:00:00+00', 'America/New_York', '2026-10-07 09:00'],
		['2026-10-07 13:00:00.123456+00', 'America/New_York', '2026-10-07 09:00'],
		// An offset on the string wins; a date-only string is local midnight.
		['2026-10-07T09:00:00-04:00', 'America/New_York', '2026-10-07 09:00'],
		['2026-10-07', 'America/New_York', '2026-10-07 00:00'],
		['', 'UTC', ''],
		['2026-10-07T13:00:00', 'Not/AZone', '']
	])('formatDateTimeMinute(%j, %s) → %j', (instant, zone, expected) => {
		expect(formatDateTimeMinute(instant, zone)).toBe(expected);
	});
});

describe('addMonthsClamped', () => {
	it.each<[string, number, string]>([
		['2026-01-31', 1, '2026-02-28'],
		['2028-01-31', 1, '2028-02-29'],
		// Century rule: 2100 is not a leap year, 2000 is.
		['2100-01-31', 1, '2100-02-28'],
		['2000-01-31', 1, '2000-02-29'],
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
	])('addMonthsClamped(%j, %d) → %j', (date, months, expected) => {
		expect(addMonthsClamped(date, months)).toBe(expected);
	});
});
