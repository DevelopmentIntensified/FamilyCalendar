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
	niv: {
		id: 'niv',
		label: 'NIV',
		attribution:
			'Holy Bible, New International Version®, NIV® Copyright ©1973, 1978, 1984, 2011 by Biblica, Inc.® Used by permission. All rights reserved worldwide.',
		bundled: false
	},
	nkjv: {
		id: 'nkjv',
		label: 'NKJV',
		attribution:
			'Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.',
		bundled: false
	},
	nasb: {
		id: 'nasb',
		label: 'NASB',
		attribution:
			'Scripture quotations taken from the New American Standard Bible®, Copyright © 1960, 1970, 1977, 1995, 2020 by The Lockman Foundation. Used by permission. All rights reserved.',
		bundled: false
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

// API.BIBLE book ids (OSIS abbreviations) for the books appearing in DAILY_VERSES.
const BOOK_CODES: Record<string, string> = {
	John: 'JHN',
	Psalm: 'PSA',
	Psalms: 'PSA',
	Proverbs: 'PRO',
	Philippians: 'PHP',
	Isaiah: 'ISA',
	Jeremiah: 'JER',
	Matthew: 'MAT',
	Romans: 'ROM',
	Joshua: 'JOS',
	Corinthians: 'CO',
	Ephesians: 'EPH',
	Colossians: 'COL',
	Zephaniah: 'ZEP',
	Hebrews: 'HEB',
	Galatians: 'GAL',
	James: 'JAS',
	Nahum: 'NAM',
	Deuteronomy: 'DEU',
	Lamentations: 'LAM',
	Mark: 'MRK'
};

function buildPassageId(reference: string): string | null {
	const match = reference.match(/^(?:(\d)\s+)?([A-Za-z]+)\s+(\d+):(\d+)(?:-(\d+))?$/);
	if (!match) return null;
	const [, chapterNum, bookName, chapter, startVerse, endVerse] = match;
	const code = BOOK_CODES[bookName];
	if (!code) return null;
	const bookId = chapterNum ? `${chapterNum}${code}` : code;
	const prefix = `${bookId}.${chapter}`;
	const start = `${prefix}.${startVerse}`;
	return endVerse && endVerse !== startVerse ? `${start}-${prefix}.${endVerse}` : start;
}

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

const API_BIBLE_BASE = 'https://api.scripture.api.bible/v1/bibles';

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

async function fetchRemoteVerse(dateIso: string, translationId: string): Promise<DailyVerse | null> {
	const info = TRANSLATIONS[translationId];
	if (!info || info.bundled) return null;

	const apiKey = process.env.BIBLE_API_KEY;
	const bibleId = process.env[`BIBLE_ID_${translationId.toUpperCase()}`];
	if (!apiKey || !bibleId) return null;

	const base = kjvVerseForDate(dateIso);
	const passageId = buildPassageId(base.reference);
	if (!passageId) return null;

	try {
		const response = await fetch(`${API_BIBLE_BASE}/${bibleId}/passages/${passageId}`, {
			headers: { 'api-key': apiKey, accept: 'application/json' }
		});
		if (!response.ok) return null;
		const payload = (await response.json()) as { data?: { content?: string } };
		const text = payload.data?.content
			?.replace(/<[^>]+>/g, '')
			.replace(/\s+/g, ' ')
			.trim();
		if (!text) return null;
		return {
			reference: base.reference,
			text,
			attribution: info.attribution,
			translation: translationId,
			fallback: false
		};
	} catch {
		return null;
	}
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
