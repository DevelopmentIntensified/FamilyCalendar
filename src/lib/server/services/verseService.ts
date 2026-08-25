import { DateTime } from 'luxon';

export interface DailyVerse {
	reference: string;
	text: string;
	attribution: string;
	translation: string;
	fallback: boolean;
}

export interface CuratedVerse {
	reference: string;
	text: string;
}

export interface VerseTranslationInfo {
	id: string;
	label: string;
	attribution: string;
	bundled: boolean;
}

export const TRANSLATIONS: Record<string, VerseTranslationInfo> = {
	kjv: {
		id: 'kjv',
		label: 'KJV',
		attribution: 'Public domain. King James Version, 1611.',
		bundled: true
	},
	esv: {
		id: 'esv',
		label: 'ESV',
		attribution:
			'The Holy Bible, English Standard Version. ESV® Text Edition: 2016. Copyright © 2001 by Crossway Bibles, a publishing ministry of Good News Publishers.',
		bundled: false
	}
};

const TRANSLATION_IDS = Object.keys(TRANSLATIONS);

const DAILY_VERSES: CuratedVerse[] = [
	{ reference: 'John 3:16', text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
	{ reference: 'Psalm 23:1', text: 'The LORD is my shepherd; I shall not want.' },
	{ reference: 'Proverbs 3:5-6', text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.' },
	{ reference: 'Philippians 4:13', text: 'I can do all things through Christ which strengtheneth me.' },
	{ reference: 'Isaiah 40:31', text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.' },
	{ reference: 'Jeremiah 29:11', text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.' },
	{ reference: 'Matthew 11:28', text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.' },
	{ reference: 'Romans 8:28', text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.' },
	{ reference: 'Joshua 1:9', text: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.' },
	{ reference: 'Psalm 46:1', text: 'God is our refuge and strength, a very present help in trouble.' },
	{ reference: 'Isaiah 41:10', text: 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.' },
	{ reference: '2 Corinthians 12:9', text: 'And he said unto me, My grace is sufficient for thee: for my strength is made perfect in weakness. Most gladly therefore will I rather glory in my infirmities, that the power of Christ may rest upon me.' },
	{ reference: 'Psalm 118:24', text: 'This is the day which the LORD hath made; we will rejoice and be glad in it.' },
	{ reference: 'Matthew 6:33', text: 'But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.' },
	{ reference: 'Proverbs 16:3', text: 'Commit thy works unto the LORD, and thy thoughts shall be established.' },
	{ reference: 'Philippians 4:6-7', text: 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God. And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.' },
	{ reference: 'Ephesians 4:32', text: 'And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ\u2019s sake hath forgiven you.' },
	{ reference: 'Colossians 3:23', text: 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men;' },
	{ reference: 'Psalm 19:1', text: 'The heavens declare the glory of God; and the firmament sheweth his handywork.' },
	{ reference: 'Romans 12:12', text: 'Rejoicing in hope; patient in tribulation; continuing instant in prayer;' },
	{ reference: 'Zephaniah 3:17', text: 'The LORD thy God in the midst of thee is mighty; he will save, he will joy over thee with joy; he will rest in his love, he will joy over thee with singing.' },
	{ reference: 'Hebrews 11:1', text: 'Now faith is the substance of things hoped for, the evidence of things not seen.' },
	{ reference: '1 Corinthians 13:4', text: 'Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up,' },
	{ reference: 'Galatians 5:22-23', text: 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, meekness, temperance: against such there is no law.' },
	{ reference: 'James 1:5', text: 'If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.' },
	{ reference: 'Psalm 121:1-2', text: 'I will lift up mine eyes unto the hills, from whence cometh my help. My help cometh from the LORD, which made heaven and earth.' },
	{ reference: 'Nahum 1:7', text: 'The LORD is good, a strong hold in the day of trouble; and he knoweth them that trust in him.' },
	{ reference: 'Deuteronomy 31:6', text: 'Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee.' },
	{ reference: 'Lamentations 3:22-23', text: 'It is of the LORD\u2019s mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.' },
	{ reference: 'Mark 11:24', text: 'Therefore I say unto you, What things soever ye desire, when ye pray, believe that ye receive them, and ye shall have them.' }
];

export { DAILY_VERSES };

// Crossway's official ESV API — free key at https://api.esv.org (5k verses/day).
const ESV_API_BASE = 'https://api.esv.org/v3/passage/text';

// Successful remote fetches only, keyed `${dateIso}:${translation}` (per server instance).
const verseCache = new Map<string, DailyVerse>();

function fallbackVerse(verse: DailyVerse): DailyVerse {
	return {
		reference: verse.reference,
		text: verse.text,
		attribution: TRANSLATIONS.kjv.attribution,
		translation: TRANSLATIONS.kjv.id,
		fallback: true
	};
}

async function fetchEsvVerse(base: DailyVerse): Promise<DailyVerse | null> {
	const apiKey = process.env.ESV_API_KEY;
	if (!apiKey) return null;

	try {
		const url = new URL(ESV_API_BASE);
		url.searchParams.set('q', base.reference);
		url.searchParams.set('include-passage-references', 'false');
		url.searchParams.set('include-verse-numbers', 'false');
		url.searchParams.set('include-first-verse-numbers', 'false');
		url.searchParams.set('include-footnotes', 'false');
		url.searchParams.set('include-headings', 'false');

		const response = await fetch(url, {
			headers: { Authorization: `Token ${apiKey}`, accept: 'application/json' },
			signal: AbortSignal.timeout(10_000)
		});
		if (!response.ok) return null;
		const payload = (await response.json()) as { passages?: string[] };
		const text = payload.passages?.[0]?.replace(/\s+/g, ' ').trim();
		if (!text) return null;
		return {
			reference: base.reference,
			text,
			attribution: TRANSLATIONS.esv.attribution,
			translation: TRANSLATIONS.esv.id,
			fallback: false
		};
	} catch {
		return null;
	}
}

async function fetchRemoteVerse(dateIso: string, translationId: string): Promise<DailyVerse | null> {
	const info = TRANSLATIONS[translationId];
	if (!info || info.bundled) return null;

	const base = kjvVerseForDate(dateIso);

	// Only ESV has a remote source; anything else non-bundled falls back.
	if (translationId !== TRANSLATIONS.esv.id) return null;
	return await fetchEsvVerse(base);
}

function kjvVerseForDate(dateIso: string): DailyVerse {
	const ordinal = DateTime.fromISO(dateIso).ordinal;
	const verse = DAILY_VERSES[ordinal % DAILY_VERSES.length];
	return {
		...verse,
		attribution: TRANSLATIONS.kjv.attribution,
		translation: TRANSLATIONS.kjv.id,
		fallback: false
	};
}

export async function getVerseForDate(dateIso: string, translation = 'kjv'): Promise<DailyVerse> {
	if (!TRANSLATION_IDS.includes(translation) || TRANSLATIONS[translation].bundled) {
		return kjvVerseForDate(dateIso);
	}

	const cacheKey = `${dateIso}:${translation}`;
	const cached = verseCache.get(cacheKey);
	if (cached) return cached;

	const remote = await fetchRemoteVerse(dateIso, translation);
	if (remote) {
		verseCache.set(cacheKey, remote);
		return remote;
	}
	return fallbackVerse(kjvVerseForDate(dateIso));
}

export async function getTodayVerse(translation = 'kjv'): Promise<DailyVerse> {
	return getVerseForDate(DateTime.now().toISODate()!, translation);
}
