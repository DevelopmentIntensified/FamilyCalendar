import { describe, it, expect } from 'vitest';
import { matchCalendarByName } from './calendarMatch';

const cals = [
	{ id: '1', name: 'Personal' },
	{ id: '2', name: 'Family Events' }
];

describe('matchCalendarByName', () => {
	it('matches exact names case-insensitively', () => {
		expect(matchCalendarByName(cals, 'personal')?.id).toBe('1');
		expect(matchCalendarByName(cals, 'FAMILY EVENTS')?.id).toBe('2');
	});

	it('falls back to partial matches in either direction', () => {
		expect(matchCalendarByName(cals, 'family')?.id).toBe('2');
		expect(matchCalendarByName(cals, 'my family events calendar')?.id).toBe('2');
	});

	it('returns null when nothing matches or the list is empty', () => {
		expect(matchCalendarByName(cals, 'work')).toBeNull();
		expect(matchCalendarByName([], 'personal')).toBeNull();
	});
});
