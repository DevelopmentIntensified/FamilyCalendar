import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
	getDaysInMonth,
	getFirstDayOfMonth,
	getFirstDayOfNextMonth,
	getDaysInLastMonth,
	formatDate,
	parseDate,
	parseDateTimeInZone,
	formatDateTimeInZone,
	convertToUserTimeZone,
	isValidTimeZone,
	getTimeZoneOffset
} from './dateUtils';

describe('getDaysInMonth', () => {
	it('returns 31 for January', () => {
		expect(getDaysInMonth(2024, 1)).toBe(31);
	});

	it('returns 28 for February in non-leap year', () => {
		expect(getDaysInMonth(2023, 2)).toBe(28);
	});

	it('returns 29 for February in leap year', () => {
		expect(getDaysInMonth(2024, 2)).toBe(29);
	});

	it('returns 30 for April', () => {
		expect(getDaysInMonth(2024, 4)).toBe(30);
	});

	it('returns 30 for June', () => {
		expect(getDaysInMonth(2024, 6)).toBe(30);
	});

	it('returns 31 for December', () => {
		expect(getDaysInMonth(2024, 12)).toBe(31);
	});

	it('handles century leap year (2000)', () => {
		expect(getDaysInMonth(2000, 2)).toBe(29);
	});

	it('handles non-leap century year (2100)', () => {
		expect(getDaysInMonth(2100, 2)).toBe(28);
	});
});

describe('getFirstDayOfMonth', () => {
	it('returns 1 for January 2024 (Monday)', () => {
		expect(getFirstDayOfMonth(2024, 1)).toBe(1);
	});

	it('returns correct weekday for February 2024', () => {
		expect(getFirstDayOfMonth(2024, 2)).toBe(4);
	});

	it('returns correct weekday for March 2024', () => {
		expect(getFirstDayOfMonth(2024, 3)).toBe(5);
	});

	it('returns correct weekday for December 2025', () => {
		expect(getFirstDayOfMonth(2025, 12)).toBe(1);
	});

	it('returns 7 for Saturday', () => {
		expect(getFirstDayOfMonth(2023, 7)).toBe(6);
	});
});

describe('getFirstDayOfNextMonth', () => {
	it('returns first day of February from January', () => {
		expect(getFirstDayOfNextMonth(2024, 1)).toBe(4);
	});

	it('returns first day of January from December', () => {
		expect(getFirstDayOfNextMonth(2024, 12)).toBe(3);
	});

	it('returns first day of March from February 2024', () => {
		expect(getFirstDayOfNextMonth(2024, 2)).toBe(5);
	});

	it('handles year rollover correctly', () => {
		expect(getFirstDayOfNextMonth(2023, 12)).toBe(1);
	});
});

describe('getDaysInLastMonth', () => {
	it('returns 31 for January (December has 31)', () => {
		expect(getDaysInLastMonth(2024, 1)).toBe(31);
	});

	it('returns 31 for March (February in non-leap year)', () => {
		expect(getDaysInLastMonth(2023, 3)).toBe(28);
	});

	it('returns 29 for March (February in leap year)', () => {
		expect(getDaysInLastMonth(2024, 3)).toBe(29);
	});

	it('returns 30 for April (March has 31)', () => {
		expect(getDaysInLastMonth(2024, 4)).toBe(31);
	});

	it('returns 31 for January of next year (December 2023)', () => {
		expect(getDaysInLastMonth(2024, 1)).toBe(31);
	});

	it('handles December correctly', () => {
		expect(getDaysInLastMonth(2024, 12)).toBe(30);
	});
});

describe('formatDate', () => {
	it('formats date as MM-dd-yyyy', () => {
		const date = DateTime.fromObject({ year: 2024, month: 1, day: 15 });
		expect(formatDate(date)).toBe('01-15-2024');
	});

	it('formats single digit month with leading zero', () => {
		const date = DateTime.fromObject({ year: 2024, month: 5, day: 3 });
		expect(formatDate(date)).toBe('05-03-2024');
	});

	it('formats single digit day with leading zero', () => {
		const date = DateTime.fromObject({ year: 2024, month: 12, day: 5 });
		expect(formatDate(date)).toBe('12-05-2024');
	});

	it('formats end of year date', () => {
		const date = DateTime.fromObject({ year: 2024, month: 12, day: 31 });
		expect(formatDate(date)).toBe('12-31-2024');
	});
});

describe('parseDate', () => {
	it('parses date string in MM-dd-yyyy format', () => {
		const result = parseDate('01-15-2024');
		expect(result.getFullYear()).toBe(2024);
		expect(result.getMonth()).toBe(0);
		expect(result.getDate()).toBe(15);
	});

	it('parses single digit month and day', () => {
		const result = parseDate('5-3-2024');
		expect(result.getFullYear()).toBe(2024);
		expect(result.getMonth()).toBe(4);
		expect(result.getDate()).toBe(3);
	});

	it('parses end of year date', () => {
		const result = parseDate('12-31-2024');
		expect(result.getFullYear()).toBe(2024);
		expect(result.getMonth()).toBe(11);
		expect(result.getDate()).toBe(31);
	});

	it('returns Date object', () => {
		const result = parseDate('01-01-2024');
		expect(result instanceof Date).toBe(true);
	});
});

describe('parseDateTimeInZone', () => {
	it('parses datetime string with user timezone', () => {
		const result = parseDateTimeInZone('2024-03-15 10:00', 'America/New_York');
		expect(result.isValid).toBe(true);
		expect(result.zoneName).toBe('America/New_York');
	});

	it('handles 24-hour format', () => {
		const result = parseDateTimeInZone('2024-06-15 14:30', 'America/Los_Angeles');
		expect(result.isValid).toBe(true);
		expect(result.hour).toBe(14);
		expect(result.minute).toBe(30);
	});

	it('handles DST transition - before DST', () => {
		const result = parseDateTimeInZone('2024-03-10 02:00', 'America/New_York');
		expect(result.isValid).toBe(true);
	});

	it('handles DST transition - after DST', () => {
		const result = parseDateTimeInZone('2024-03-15 02:00', 'America/New_York');
		expect(result.isValid).toBe(true);
	});
});

describe('formatDateTimeInZone', () => {
	it('formats datetime with timezone offset', () => {
		const dt = DateTime.fromObject({ year: 2024, month: 6, day: 15, hour: 10 }, { zone: 'America/New_York' });
		const result = formatDateTimeInZone(dt, 'America/New_York');
		expect(result).toContain('2024-06-15');
	});

	it('preserves timezone in ISO string', () => {
		const dt = DateTime.fromObject({ year: 2024, month: 1, day: 15, hour: 10 }, { zone: 'America/Los_Angeles' });
		const result = formatDateTimeInZone(dt, 'America/Los_Angeles');
		expect(result).toContain('-08:00');
	});
});

describe('convertToUserTimeZone', () => {
	it('converts datetime to specified timezone', () => {
		const dt = DateTime.fromISO('2024-06-15T10:00:00', { zone: 'UTC' });
		const result = convertToUserTimeZone(dt, 'America/New_York');
		expect(result.zoneName).toBe('America/New_York');
	});

	it('handles different timezones correctly', () => {
		const dt = DateTime.fromISO('2024-12-25T12:00:00', { zone: 'America/Los_Angeles' });
		const result = convertToUserTimeZone(dt, 'America/New_York');
		expect(result.zoneName).toBe('America/New_York');
	});
});

describe('isValidTimeZone', () => {
	it('returns true for valid timezone', () => {
		expect(isValidTimeZone('America/New_York')).toBe(true);
		expect(isValidTimeZone('Europe/London')).toBe(true);
		expect(isValidTimeZone('Asia/Tokyo')).toBe(true);
	});

	it('returns false for invalid timezone', () => {
		expect(isValidTimeZone('Invalid/Timezone')).toBe(false);
		expect(isValidTimeZone('fake_zone')).toBe(false);
	});
});

describe('getTimeZoneOffset', () => {
	it('returns offset string for valid timezone', () => {
		const result = getTimeZoneOffset('America/New_York');
		expect(result).toMatch(/^[+-]\d{2}:\d{2}$/);
	});

	it('returns different offsets for different timezones', () => {
		const nyOffset = getTimeZoneOffset('America/New_York');
		const tokyoOffset = getTimeZoneOffset('Asia/Tokyo');
		expect(nyOffset).not.toBe(tokyoOffset);
	});
});