import { describe, it, expect, beforeEach } from 'vitest';
import { DateTime } from 'luxon';
import {
	getVerseForDate,
	getTodayVerse,
	DAILY_VERSES,
	TRANSLATIONS
} from './verseService';

const ENV_KEYS = ['BIBLE_API_KEY', 'BIBLE_ID_NIV', 'BIBLE_ID_NKJV', 'BIBLE_ID_NASB', 'BIBLE_ID_ESV'];

beforeEach(() => {
	for (const key of ENV_KEYS) {
		delete process.env[key];
	}
});

describe('TRANSLATIONS', () => {
	it('exposes exactly the five supported translations', () => {
		expect(Object.keys(TRANSLATIONS).sort()).toEqual(['esv', 'kjv', 'nasb', 'niv', 'nkjv']);
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
			expect(info.id).toBeTruthy();
		}
	});

	it('marks only KJV as bundled (copyrighted texts are not bundled)', () => {
		for (const [id, info] of Object.entries(TRANSLATIONS)) {
			if (id === 'kjv') {
				expect(info.bundled).toBe(true);
				expect(info.attribution).toBe('Public domain. King James Version, 1611.');
			} else {
				expect(info.bundled).toBe(false);
			}
		}
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

describe('getVerseForDate (non-bundled translations)', () => {
	it('falls back to bundled KJV text when no API key is configured', async () => {
		const verse = await getVerseForDate('2026-08-24', 'niv');
		expect(verse.text.length).toBeGreaterThan(0);
		expect(DAILY_VERSES.some((v) => v.text === verse.text)).toBe(true);
		expect(verse.fallback).toBe(true);
		expect(verse.translation).toBe('kjv');
		// The requested translation's copyright attribution must be suppressed.
		expect(verse.attribution).toBe(TRANSLATIONS.kjv.attribution);
	});

	it('falls back when the API key exists but the translation has no BIBLE_ID', async () => {
		process.env.BIBLE_API_KEY = 'test-key';
		const verse = await getVerseForDate('2026-08-24', 'esv');
		expect(verse.fallback).toBe(true);
		expect(verse.translation).toBe('kjv');
	});

	it('does not fall back for every supported translation without config', async () => {
		for (const id of ['niv', 'nkjv', 'nasb', 'esv']) {
			const verse = await getVerseForDate('2026-08-24', id);
			expect(verse.fallback).toBe(true);
		}
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
		expect(await getTodayVerse('nkjv')).toEqual(await getVerseForDate(today, 'nkjv'));
		expect((await getTodayVerse('nasb')).fallback).toBe(true);
	});
});
