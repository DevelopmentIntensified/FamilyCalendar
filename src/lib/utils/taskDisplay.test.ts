import { describe, it, expect } from 'vitest';
import { formatDue, freqNoun } from './taskDisplay';

describe('freqNoun', () => {
	it('maps frequencies to singular nouns', () => {
		expect(freqNoun('daily')).toBe('day');
		expect(freqNoun('weekly')).toBe('week');
		expect(freqNoun('monthly')).toBe('month');
		expect(freqNoun('yearly')).toBe('year');
	});

	it('returns undefined for unknown input', () => {
		expect(freqNoun(null)).toBeUndefined();
		expect(freqNoun('fortnightly')).toBeUndefined();
	});
});

describe('formatDue', () => {
	it('returns empty for missing/invalid dates', () => {
		expect(formatDue(null)).toBe('');
		expect(formatDue('not-a-date')).toBe('');
	});

	it('omits the year for same-year dates, keeps it otherwise', () => {
		const thisYear = new Date().getFullYear();
		expect(formatDue(`${thisYear}-09-10`)).toBe(
			new Date(`${thisYear}-09-10`).toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric'
			})
		);
		expect(formatDue('2001-01-05')).toContain('2001');
	});
});
