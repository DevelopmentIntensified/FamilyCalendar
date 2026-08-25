import { describe, it, expect, beforeEach } from 'vitest';
import { DateTime } from 'luxon';
import {
	getVerseForDate,
	getTodayVerse,
	DAILY_VERSES,
	TRANSLATIONS
} from './verseService';

beforeEach(() => {
	delete process.env.ESV_API_KEY;
});

describe('TRANSLATIONS', () => {
	it('exposes exactly the two supported translations', () => {
		expect(Object.keys(TRANSLATIONS).sort()).toEqual(['esv', 'kjv']);
	});

	it('every entry has the required shape and non-empty strings', () => {
		for (const info of Object.values(TRANSLATIONS)) {
			expect(Object.keys(info).sort()).toEqual(['attribution', 'bundled', 'id', 'label']);
			expect(typeof info.id).toBe('string');
			expect(typeof info.label).toBe('string');
			expect(info.label.length).toBeGreaterThan(0);
			expect(typeof info.attribution).toBe('string');
			expect(info.attribution.length).toBeGreaterThan(0);
			expect(typeof info.bundled).toBe('boolean');
		}
	});

	it('marks only KJV as bundled (ESV text is fetched, not bundled)', () => {
		expect(TRANSLATIONS.kjv.bundled).toBe(true);
		expect(TRANSLATIONS.kjv.attribution).toBe('Public domain. King James Version, 1611.');
		expect(TRANSLATIONS.esv.bundled).toBe(false);
	});
});

describe('getVerseForDate (KJV)', () => {
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
		// Dec 31 2026 is ordinal 365 -> 365 % 30 = 5 -> Jeremiah 29:11.
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

	it('returns bundled KJV text with public-domain attribution and no fallback flag', async () => {
		const verse = await getVerseForDate('2026-08-24', 'kjv');
		const curated = DAILY_VERSES.find((v) => v.reference === verse.reference)!;
		expect(verse.text).toBe(curated.text);
		expect(verse.translation).toBe('kjv');
		expect(verse.attribution).toBe(TRANSLATIONS.kjv.attribution);
		expect(verse.fallback).toBe(false);
	});

	it('treats unknown translations as KJV', async () => {
		const verse = await getVerseForDate('2026-08-24', 'not-a-real-translation');
		expect(verse.translation).toBe('kjv');
		expect(verse.fallback).toBe(false);
	});
});

describe('getVerseForDate (ESV)', () => {
	it('falls back to bundled KJV text when no ESV_API_KEY is configured', async () => {
		const verse = await getVerseForDate('2026-08-24', 'esv');
		expect(verse.text.length).toBeGreaterThan(0);
		expect(DAILY_VERSES.some((v) => v.text === verse.text)).toBe(true);
		expect(verse.fallback).toBe(true);
		expect(verse.translation).toBe('kjv');
		// The requested translation's copyright attribution must be suppressed.
		expect(verse.attribution).toBe(TRANSLATIONS.kjv.attribution);
	});

	it('falls back gracefully when the key is set but the API is unreachable', async () => {
		// Pointless key: fetch fails or 401s -> fallback path, never throws.
		process.env.ESV_API_KEY = 'invalid-test-key';
		const verse = await getVerseForDate('2026-08-24', 'esv');
		expect(verse.fallback).toBe(true);
		expect(verse.translation).toBe('kjv');
		expect(DAILY_VERSES.some((v) => v.text === verse.text)).toBe(true);
	});
});

describe('getTodayVerse', () => {
	it("returns today's verse with a valid shape", async () => {
		const verse = await getTodayVerse();
		expect(typeof verse.reference).toBe('string');
		expect(typeof verse.text).toBe('string');
		expect(verse).toEqual(await getVerseForDate(DateTime.now().toISODate()!));
	});

	it('passes the translation through', async () => {
		const today = DateTime.now().toISODate()!;
		expect(await getTodayVerse('esv')).toEqual(await getVerseForDate(today, 'esv'));
		expect((await getTodayVerse('esv')).fallback).toBe(true);
	});
});
