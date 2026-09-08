import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { getVerseForDate, getTodayVerse, DAILY_VERSES, TRANSLATIONS } from './verseService';

describe('TRANSLATIONS', () => {
	it('exposes exactly one supported translation (ESV)', () => {
		expect(Object.keys(TRANSLATIONS).sort()).toEqual(['esv']);
	});

	it('every entry has the required shape and non-empty strings', () => {
		for (const info of Object.values(TRANSLATIONS)) {
			expect(Object.keys(info).sort()).toEqual(['attribution', 'bundled', 'id', 'label']);
			expect(info.id).toEqual(expect.any(String));
			expect(info.label).toEqual(expect.any(String));
			expect(info.label.length).toBeGreaterThan(0);
			expect(info.attribution).toEqual(expect.any(String));
			expect(info.attribution.length).toBeGreaterThan(0);
			expect(info.bundled).toEqual(expect.any(Boolean));
		}
	});

	it('marks ESV as bundled (local list only, no remote fetch)', () => {
		expect(TRANSLATIONS.esv.bundled).toBe(true);
		expect(Object.values(TRANSLATIONS).every((t) => t.bundled)).toBe(true);
	});
});

describe('getVerseForDate (bundled)', () => {
	it('returns a valid shape for every curated verse', () => {
		expect(DAILY_VERSES.length).toBe(40);
		for (const verse of DAILY_VERSES) {
			expect(verse.reference).toEqual(expect.any(String));
			expect(verse.text).toEqual(expect.any(String));
			expect(verse.reference.length).toBeGreaterThan(0);
			expect(verse.text.length).toBeGreaterThan(0);
			expect(verse.text).toMatch(/^[A-Z]/);
		}
	});

	it('is deterministic: same date, same verse', async () => {
		const a = await getVerseForDate('2026-08-24');
		const b = await getVerseForDate('2026-08-24');
		expect(a).toEqual(b);
	});

	it('varies across dates', async () => {
		expect(await getVerseForDate('2026-01-01')).not.toEqual(await getVerseForDate('2026-01-02'));
		expect(await getVerseForDate('2026-01-01')).not.toEqual(await getVerseForDate('2026-02-01'));
	});

	it('indexes by day-of-year modulo the verse count', async () => {
		// Jan 1 is ordinal 1 -> index 1 -> Psalm 23:1.
		expect((await getVerseForDate('2026-01-01')).reference).toBe('Psalm 23:1');
		// Dec 31 2026 is ordinal 365 -> 365 % 40 = 5 -> Jeremiah 29:11.
		expect((await getVerseForDate('2026-12-31')).reference).toBe('Jeremiah 29:11');
	});

	it('stays in range across a whole year', async () => {
		let cursor = DateTime.fromISO('2026-01-01');
		while (cursor.year === 2026) {
			const verse = await getVerseForDate(cursor.toISODate()!);
			expect(
				DAILY_VERSES.some((v) => v.reference === verse.reference && v.text === verse.text)
			).toBe(true);
			cursor = cursor.plus({ days: 1 });
		}
	});

	it('returns bundled public-domain text with no fallback flag for unknown translations', async () => {
		const verse = await getVerseForDate('2026-08-24', 'not-a-real-translation');
		const curated = DAILY_VERSES.find((v) => v.reference === verse.reference)!;
		expect(verse.text).toBe(curated.text);
		expect(verse.translation).toBe('esv');
		expect(verse.attribution).toBe('Public domain.');
		expect(verse.fallback).toBe(false);
	});

	it('treats unknown translations as bundled ESV-branded text', async () => {
		const verse = await getVerseForDate('2026-08-24', 'not-a-real-translation');
		expect(verse.translation).toBe('esv');
		expect(verse.fallback).toBe(false);
	});
});

describe('getVerseForDate (ESV)', () => {
	it('resolves from the bundled list with no fallback flag and no network', async () => {
		const verse = await getVerseForDate('2026-08-24', 'esv');
		expect(verse.text.length).toBeGreaterThan(0);
		expect(DAILY_VERSES.some((v) => v.text === verse.text)).toBe(true);
		expect(verse.fallback).toBe(false);
		expect(verse.translation).toBe('esv');
		expect(verse.attribution).toBe('Public domain.');
	});
});

describe('getTodayVerse', () => {
	it("returns today's verse with a valid shape", async () => {
		const verse = await getTodayVerse();
		expect(verse.reference).toEqual(expect.any(String));
		expect(verse.text).toEqual(expect.any(String));
		expect(verse).toEqual(await getVerseForDate(DateTime.now().toISODate()!));
	});

	it('passes the translation through', async () => {
		const today = DateTime.now().toISODate()!;
		expect(await getTodayVerse('esv')).toEqual(await getVerseForDate(today, 'esv'));
		expect((await getTodayVerse('esv')).fallback).toBe(false);
	});
});
