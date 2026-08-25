import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { getVerseForDate, getTodayVerse, DAILY_VERSES } from './verseService';

describe('getVerseForDate', () => {
	it('returns a valid shape for every curated verse', () => {
		expect(DAILY_VERSES.length).toBe(30);
		for (const verse of DAILY_VERSES) {
			expect(typeof verse.reference).toBe('string');
			expect(typeof verse.text).toBe('string');
			expect(verse.reference.length).toBeGreaterThan(0);
			expect(verse.text.length).toBeGreaterThan(0);
			expect(verse.text).toMatch(/^[A-Z]/);
		}
	});

	it('is deterministic: same date, same verse', () => {
		const a = getVerseForDate('2026-08-24');
		const b = getVerseForDate('2026-08-24');
		expect(a).toEqual(b);
	});

	it('varies across dates', () => {
		expect(getVerseForDate('2026-01-01')).not.toEqual(getVerseForDate('2026-01-02'));
		expect(getVerseForDate('2026-01-01')).not.toEqual(getVerseForDate('2026-02-01'));
	});

	it('indexes by day-of-year modulo the verse count', () => {
		// Jan 1 is ordinal 1 -> index 1 -> Psalm 23:1.
		expect(getVerseForDate('2026-01-01').reference).toBe('Psalm 23:1');
		// Dec 31 2026 is ordinal 365 -> 365 % 30 = 5 -> Jeremiah 29:11.
		expect(getVerseForDate('2026-12-31').reference).toBe('Jeremiah 29:11');
	});

	it('stays in range across a whole year', () => {
		let cursor = DateTime.fromISO('2026-01-01');
		while (cursor.year === 2026) {
			const verse = getVerseForDate(cursor.toISODate()!);
			expect(DAILY_VERSES).toContainEqual(verse);
			cursor = cursor.plus({ days: 1 });
		}
	});
});

describe('getTodayVerse', () => {
	it('returns today\'s verse with a valid shape', () => {
		const verse = getTodayVerse();
		expect(typeof verse.reference).toBe('string');
		expect(typeof verse.text).toBe('string');
		expect(verse).toEqual(getVerseForDate(DateTime.now().toISODate()!));
	});
});
