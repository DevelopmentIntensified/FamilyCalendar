/**
 * parsing vocabulary — THE token address (review #1/#5).
 *
 * One home for month names, weekday names, ordinal words, part-of-day
 * anchors, time-of-day anchors, recurrence unit words and the small token
 * helpers every grammar reads (legacy `src/lib/utils/dateVocab.ts` plus the
 * token half of `src/lib/server/utils/dateParsing.ts`). No other file may
 * declare a second month map, weekday order or ordinal table.
 *
 * Client-safe on purpose: pure data + pure helpers, no Luxon, no db, no
 * server imports — the Task quick-add is bundled to the browser.
 */
// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

/** Full month names, 0-indexed (January = 0). */
export const MONTH_FULL: readonly string[] = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december'
];

/** Month abbreviation → 0-based index. */
export const MONTH_ABBREV_INDEX = {
	jan: 0,
	feb: 1,
	mar: 2,
	apr: 3,
	may: 4,
	jun: 5,
	jul: 6,
	aug: 7,
	sep: 8,
	sept: 8,
	oct: 9,
	nov: 10,
	dec: 11
} satisfies Record<string, number>;

/** Month full name → 0-based index. */
export const MONTH_FULL_INDEX: Record<string, number> = {};
for (let i = 0; i < 12; i++) {
	MONTH_FULL_INDEX[MONTH_FULL[i]] = i;
}

/** All month tokens → 0-based index (full + abbreviations). */
export const MONTH_INDEX_0: Record<string, number> = Object.assign(
	{},
	MONTH_FULL_INDEX,
	MONTH_ABBREV_INDEX
) as Record<string, number>;

/** All month tokens → 1-based index (the shape the rollover rule takes). */
export const MONTH_INDEX_1: Record<string, number> = {};
for (const [k, v] of Object.entries(MONTH_INDEX_0)) {
	MONTH_INDEX_1[k] = v + 1;
}

/**
 * Regex-safe alternation of all month tokens, longest-first so "september"
 * wins over "sept"/"sep".
 */
export const MONTH_ALT =
	'january|february|september|december|november|october|august|april|march|june|july|jun|jul|may|sept|jan|feb|mar|apr|aug|sep|oct|nov|dec';

/**
 * Regex-safe alternation of month tokens for group capture. Each month
 * captured as a single group; token order does not affect correctness
 * because each token is unique.
 */
export const MONTH_NAME_TOKEN =
	'(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)';

// ---------------------------------------------------------------------------
// Ordinal words ("first of May", "twenty fourth of december")
// ---------------------------------------------------------------------------

/**
 * Ordinal word → day of month. Hyphenated, spaced and fused forms all count
 * ("twenty-fourth", "twenty fourth", "twentyfourth"); callers normalize
 * whitespace and lowercase before lookup.
 */
export const ORDINAL_WORD_MAP: Record<string, number> = {
	first: 1,
	second: 2,
	third: 3,
	fourth: 4,
	fifth: 5,
	sixth: 6,
	seventh: 7,
	eighth: 8,
	ninth: 9,
	tenth: 10,
	eleventh: 11,
	twelfth: 12,
	thirteenth: 13,
	fourteenth: 14,
	fifteenth: 15,
	sixteenth: 16,
	seventeenth: 17,
	eighteenth: 18,
	nineteenth: 19,
	twentieth: 20,
	'twenty-first': 21,
	'twenty first': 21,
	'twenty-second': 22,
	'twenty second': 22,
	'twenty-third': 23,
	'twenty third': 23,
	twentyfourth: 24,
	'twenty-fourth': 24,
	'twenty fourth': 24,
	'twenty-fifth': 25,
	'twenty fifth': 25,
	'twenty-sixth': 26,
	'twenty sixth': 26,
	'twenty-seventh': 27,
	'twenty seventh': 27,
	'twenty-eighth': 28,
	'twenty eighth': 28,
	'twenty-ninth': 29,
	'twenty ninth': 29,
	thirtieth: 30,
	'thirty-first': 31,
	'thirty first': 31
};

/**
 * Regex-safe alternation of the ordinal words the date chain recognizes.
 * Covers the hyphenated and fused spellings; spaced forms are matched after
 * the raw text is whitespace-normalized.
 */
export const ORDINAL_WORDS_PATTERN =
	'(?:twenty-(?:first|second|third|fifth|sixth|seventh|eighth|ninth)|thirty-first|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twentyfourth|twentyfifth|twentysixth|twentyseventh|twentyeighth|twentyninth|thirtieth|thirtyfirst)';

// ---------------------------------------------------------------------------
// Weekdays
// ---------------------------------------------------------------------------

/** Full weekday names, Sunday = 0 (matches JS Date.getDay()). */
export const WEEKDAY_FULL: readonly string[] = [
	'sunday',
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday'
];

/** Short weekday tokens (bare-weekday matching). */
export const WEEKDAY_SHORT: readonly string[] = [
	'sun',
	'mon',
	'tue',
	'tues',
	'wed',
	'thu',
	'thur',
	'thurs',
	'fri',
	'sat'
];

/** Regex-safe alternation of full weekday names. */
export const DAY_ALT = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';

/**
 * Regex-safe non-capturing group of ALL weekday tokens (full + short).
 */
export const WEEKDAY_TOKEN =
	'(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)';

/** Full weekday name → JS weekday number (Sunday = 0); short forms excluded. */
export const DAY_MAP = {
	sunday: 0,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6
} satisfies Record<string, number>;

/** JS weekday number for a (lowercased) full day name, or undefined. */
export function dayNumber(name: string): number | undefined {
	return name in DAY_MAP ? DAY_MAP[name as keyof typeof DAY_MAP] : undefined;
}

/** Weekday abbreviation/full name → RRULE code. Null when unrecognized. */
export function normalizeDayToken(t: string): string | null {
	const s = t.toLowerCase();
	if (s.startsWith('mon')) return 'MO';
	if (s.startsWith('tue')) return 'TU';
	if (s.startsWith('wed')) return 'WE';
	if (s.startsWith('thu')) return 'TH';
	if (s.startsWith('fri')) return 'FR';
	if (s.startsWith('sat')) return 'SA';
	if (s.startsWith('sun')) return 'SU';
	return null;
}

/** Tiny edit distance for typo-tolerant weekday matching (7 words — trivial). */
function editDistance(a: string, b: string): number {
	const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let prev = dp[0];
		dp[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const next = dp[j];
			dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
			prev = next;
		}
	}
	return dp[b.length];
}

/**
 * Map a stray word to a weekday code within typo range. Exact names win
 * immediately (so "monday" never fuzzy-matches "sunday", 2 edits away);
 * otherwise the budget scales with length (≤1 below 7 chars, ≤2 above).
 * Adjacent transposition counts as one typo. Short tokens and month names
 * never qualify.
 */
export function fuzzyDayToken(word: string): string | null {
	const s = word.toLowerCase();
	if (s.length < 4) return null;
	if (MONTH_INDEX_1[s] !== undefined) return null;
	const exact = WEEKDAY_FULL.indexOf(s);
	if (exact >= 0) return normalizeDayToken(WEEKDAY_FULL[exact]);
	for (let i = 0; i + 1 < s.length; i++) {
		const swapped = s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
		const hit = WEEKDAY_FULL.indexOf(swapped);
		if (hit >= 0) return normalizeDayToken(WEEKDAY_FULL[hit]);
	}
	const budget = s.length < 7 ? 1 : 2;
	for (const name of WEEKDAY_FULL) {
		if (editDistance(s, name) <= budget) return normalizeDayToken(name);
	}
	return null;
}

// ---------------------------------------------------------------------------
// Time-of-day anchors
// ---------------------------------------------------------------------------

/** Part-of-day word → HH:mm anchor for "returning Sunday morning" phrasings. */
export const DAYPART_TIMES: Record<string, string> = {
	morning: '09:00',
	afternoon: '14:00',
	evening: '18:00',
	noon: '12:00'
};

/** Time-of-day phrase → HH:mm ("early morning", "afternoon", …). */
export const TOD_TIMES: Record<string, string> = {
	'early morning': '06:00',
	morning: '09:00',
	afternoon: '14:00',
	evening: '18:00'
};

// ---------------------------------------------------------------------------
// Recurrence units
// ---------------------------------------------------------------------------

/** Bare recurrence unit words used in "every N day/week/month/year" phrases. */
export const RECURRENCE_UNITS = 'day|week|month|year' as const;

// ---------------------------------------------------------------------------
// Weekday token scan
// ---------------------------------------------------------------------------

/** One weekday word found in the text, with the offset it started at. */
export interface DayToken {
	raw: string;
	code: string;
	index: number;
}

/**
 * Single weekday-token pass: exact abbreviations first, then a typo scan
 * when fewer than 2 distinct days matched.
 */
export function extractDayTokens(text: string): DayToken[] {
	const out: DayToken[] = [];
	const seen = new Set<string>();
	const exact = text.matchAll(
		/\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nes|nesday)?|thu(?:r?s?(?:day)?)?|fri(?:day)?|sat(?:ur|urday)?|sun(?:day)?)s?\b/gi
	);
	for (const m of exact) {
		const code = normalizeDayToken(m[1]);
		if (!code) continue;
		out.push({ raw: m[0], code, index: m.index ?? 0 });
		seen.add(code);
	}
	if (seen.size < 2) {
		for (const m of text.matchAll(/\b([a-z]{4,})\b/gi)) {
			const code = fuzzyDayToken(m[1]);
			if (code && !seen.has(code)) {
				out.push({ raw: m[0], code, index: m.index ?? 0 });
				seen.add(code);
			}
		}
	}
	return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------
// Time and regex helpers (legacy `dateParsing.ts`)
// ---------------------------------------------------------------------------

/** `HH:mm` from an hour and minute, zero-padded. */
export function normalizeTime(hour: number, minute = 0): string {
	return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * Normalize a meridiem capture that may carry periods ("p.m.", "a. m.")
 * down to `pm`/`am`. Anything else passes through unchanged, so bare
 * partial captures ("p") keep their old no-adjustment behavior (#207).
 */
export function normalizeMeridiem(period?: string): string | undefined {
	if (!period) return undefined;
	return period.toLowerCase().replace(/[^apm]/g, '');
}

/** Apply a captured meridiem to a 12-hour clock hour. */
export function applyPeriod(hour: number, period?: string): number {
	const p = period?.toLowerCase();
	if (p === 'pm' && hour < 12) return hour + 12;
	if (p === 'am' && hour === 12) return 0;
	return hour;
}

/** Escape special regex characters in a string. */
export function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
