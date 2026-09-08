import { describe, it, expect } from 'vitest';
import { zoneFromSettings } from './userTimezone';

describe('zoneFromSettings', () => {
	it('returns the stored zone when valid', () => {
		expect(zoneFromSettings({ timeZone: 'America/Chicago' })).toBe('America/Chicago');
	});

	it('returns undefined for missing, empty, or invalid zones', () => {
		expect(zoneFromSettings(null)).toBeUndefined();
		expect(zoneFromSettings({})).toBeUndefined();
		expect(zoneFromSettings({ timeZone: '' })).toBeUndefined();
		expect(zoneFromSettings({ timeZone: 'Not/AZone' })).toBeUndefined();
	});
});
