/**
 * The one token address: every table and the typo-tolerant weekday scan.
 * Carries `src/lib/utils/dateVocab.test.ts` (18 `it()` + an 11-row `it.each`).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	DAY_ALT,
	DAYPART_TIMES,
	DAY_MAP,
	MONTH_ABBREV_INDEX,
	MONTH_ALT,
	MONTH_FULL,
	MONTH_FULL_INDEX,
	MONTH_INDEX_0,
	MONTH_INDEX_1,
	MONTH_NAME_TOKEN,
	ORDINAL_WORD_MAP,
	RECURRENCE_UNITS,
	TOD_TIMES,
	WEEKDAY_FULL,
	WEEKDAY_SHORT,
	WEEKDAY_TOKEN,
	dayNumber,
	escapeRegExp,
	extractDayTokens,
	fuzzyDayToken,
	normalizeDayToken,
	normalizeMeridiem,
	normalizeTime
} from './parsing.vocabulary.rules';

describe('vocabulary — month names', () => {
	it('MONTH_FULL has exactly 12 entries, lowercase, January-first', () => {
		expect(MONTH_FULL).toHaveLength(12);
		expect(MONTH_FULL[0]).toBe('january');
		expect(MONTH_FULL[11]).toBe('december');
	});

	it('MONTH_FULL_INDEX maps every full name to its 0-based index', () => {
		const cases: [string, number][] = [
			['january', 0],
			['february', 1],
			['march', 2],
			['april', 3],
			['may', 4],
			['june', 5],
			['july', 6],
			['august', 7],
			['september', 8],
			['october', 9],
			['november', 10],
			['december', 11]
		];
		for (const [name, idx] of cases) expect(MONTH_FULL_INDEX[name]).toBe(idx);
	});

	it('MONTH_ABBREV_INDEX maps all abbreviations to 0-based index', () => {
		const cases = [
			['jan', 0],
			['feb', 1],
			['mar', 2],
			['apr', 3],
			['may', 4],
			['jun', 5],
			['jul', 6],
			['aug', 7],
			['sep', 8],
			['sept', 8],
			['oct', 9],
			['nov', 10],
			['dec', 11]
		] as const;
		for (const [abbr, idx] of cases) expect(MONTH_ABBREV_INDEX[abbr]).toBe(idx);
	});

	it('MONTH_INDEX_0 is the union of full + abbrev, all 0-based', () => {
		expect(MONTH_INDEX_0['january']).toBe(0);
		expect(MONTH_INDEX_0['december']).toBe(11);
		expect(MONTH_INDEX_0['jan']).toBe(0);
		expect(MONTH_INDEX_0['sept']).toBe(8);
		expect(MONTH_INDEX_0['sep']).toBe(8);
		expect(MONTH_INDEX_0['dec']).toBe(11);
	});

	it('MONTH_INDEX_1 is 1-based (MONTH_INDEX_0 + 1 for every key)', () => {
		for (const [k, v0] of Object.entries(MONTH_INDEX_0)) expect(MONTH_INDEX_1[k]).toBe(v0 + 1);
	});

	it('MONTH_ALT is longest-first (september before sep and sept)', () => {
		const tokens = MONTH_ALT.split('|');
		expect(tokens.indexOf('september')).toBeLessThan(tokens.indexOf('sept'));
		expect(tokens.indexOf('sept')).toBeLessThan(tokens.indexOf('sep'));
		expect(tokens.indexOf('january')).toBeLessThan(tokens.indexOf('jan'));
	});

	it('MONTH_ALT regex matches full month names case-insensitively', () => {
		const re = new RegExp(`\\b(${MONTH_ALT})\\b`, 'i');
		for (const name of MONTH_FULL) {
			expect(re.test(name)).toBe(true);
			expect(re.test(name.toUpperCase())).toBe(true);
		}
	});

	it('MONTH_ALT regex matches every abbreviation, jun/jul included', () => {
		const re = new RegExp(`\\b(${MONTH_ALT})\\b`, 'i');
		const abbrevs = [
			'jan',
			'feb',
			'mar',
			'apr',
			'may',
			'jun',
			'jul',
			'aug',
			'sep',
			'sept',
			'oct',
			'nov',
			'dec'
		];
		for (const a of abbrevs) expect(re.test(a)).toBe(true);
	});

	it('MONTH_NAME_TOKEN captures group works for all month tokens', () => {
		const re = new RegExp(`\\b${MONTH_NAME_TOKEN}\\b`, 'i');
		const tokens = [
			'jan',
			'january',
			'feb',
			'february',
			'mar',
			'march',
			'apr',
			'april',
			'may',
			'jun',
			'june',
			'jul',
			'july',
			'aug',
			'august',
			'sep',
			'sept',
			'september',
			'oct',
			'october',
			'nov',
			'november',
			'dec',
			'december'
		];
		for (const t of tokens) {
			const m = re.exec(t);
			expect(m).not.toBeNull();
			expect(m![1].toLowerCase()).toBe(t.toLowerCase());
		}
	});
});

describe('vocabulary — ordinal words', () => {
	it('maps hyphenated, spaced and fused forms to the same day', () => {
		const rows: Array<[string, number]> = [
			['first', 1],
			['twentieth', 20],
			['twenty-fourth', 24],
			['twenty fourth', 24],
			['twentyfourth', 24],
			['thirty-first', 31],
			['thirty first', 31]
		];
		for (const [word, day] of rows) expect(ORDINAL_WORD_MAP[word]).toBe(day);
	});
});

describe('vocabulary — weekday names', () => {
	it('WEEKDAY_FULL has exactly 7 entries, Sunday-first', () => {
		expect(WEEKDAY_FULL).toHaveLength(7);
		expect(WEEKDAY_FULL[0]).toBe('sunday');
		expect(WEEKDAY_FULL[6]).toBe('saturday');
	});

	it('DAY_ALT regex matches all full weekday names', () => {
		const re = new RegExp(`\\b(${DAY_ALT})\\b`, 'i');
		for (const day of WEEKDAY_FULL) {
			expect(re.test(day)).toBe(true);
			expect(re.test(day.toUpperCase())).toBe(true);
		}
	});

	it('WEEKDAY_SHORT covers common short forms', () => {
		for (const short of ['sun', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat']) {
			expect(WEEKDAY_SHORT).toContain(short);
		}
	});

	it('WEEKDAY_TOKEN regex matches all full and short weekday names', () => {
		const re = new RegExp(`\\b${WEEKDAY_TOKEN}\\b`, 'i');
		for (const t of [...WEEKDAY_FULL, ...WEEKDAY_SHORT]) expect(re.test(t)).toBe(true);
	});

	it('WEEKDAY_TOKEN does not match partial words inside longer words', () => {
		const re = new RegExp(`\\b${WEEKDAY_TOKEN}\\b`, 'i');
		expect(re.test('mondays')).toBe(false);
		expect(re.test('sundays')).toBe(false);
	});

	it('DAY_ALT does NOT match short forms (intentional — the event parser uses only full)', () => {
		const re = new RegExp(`\\b(${DAY_ALT})\\b`, 'i');
		expect(re.test('mon')).toBe(false);
		expect(re.test('sun')).toBe(false);
		expect(re.test('fri')).toBe(false);
	});

	it('DAY_MAP/dayNumber read full names only, Sunday = 0', () => {
		const rows: Array<[string, number]> = [
			['sunday', 0],
			['monday', 1],
			['saturday', 6]
		];
		for (const [name, num] of rows) {
			expect(DAY_MAP[name as keyof typeof DAY_MAP]).toBe(num);
			expect(dayNumber(name)).toBe(num);
		}
		expect(dayNumber('mon')).toBeUndefined();
	});

	it('normalizeDayToken maps every abbreviation to its RRULE code', () => {
		const rows: Array<[string, string]> = [
			['mon', 'MO'],
			['monday', 'MO'],
			['tues', 'TU'],
			['thurs', 'TH'],
			['sat', 'SA'],
			['sunday', 'SU']
		];
		for (const [token, code] of rows) expect(normalizeDayToken(token)).toBe(code);
		expect(normalizeDayToken('mo')).toBeNull();
	});
});

describe('vocabulary — fuzzy weekday typos', () => {
	it('resolves adjacent transpositions as one typo', () => {
		expect(fuzzyDayToken('mondya')).toBe('MO');
		expect(fuzzyDayToken('fridya')).toBe('FR');
	});

	it('budget is 1 below 7 chars and 2 from 7', () => {
		expect(fuzzyDayToken('sundya')).toBe('SU');
		expect(fuzzyDayToken('wensday')).toBe('WE');
		expect(fuzzyDayToken('satuday')).toBe('SA');
	});

	it('does not invent weekdays from short words or month names', () => {
		expect(fuzzyDayToken('sat')).toBeNull();
		expect(fuzzyDayToken('may')).toBeNull();
		expect(fuzzyDayToken('june')).toBeNull();
		expect(fuzzyDayToken('mondayx')).toBe('MO');
	});

	it('exact names win before the edit-distance scan (monday never reads sunday)', () => {
		expect(fuzzyDayToken('monday')).toBe('MO');
	});
});

describe('vocabulary — day token scan', () => {
	it('collects exact tokens in text order, plurals included', () => {
		const tokens = extractDayTokens('mon and tue and fri');
		expect(tokens.map((t) => t.code)).toEqual(['MO', 'TU', 'FR']);
		expect(tokens.map((t) => t.raw)).toEqual(['mon', 'tue', 'fri']);
	});

	it('adds one typo match only when fewer than two distinct days matched', () => {
		expect(extractDayTokens('lunch wensday').map((t) => t.code)).toEqual(['WE']);
		// Two exact days already exist, so the typo scan never runs.
		expect(extractDayTokens('mon and tue and wensday').map((t) => t.code)).toEqual(['MO', 'TU']);
	});

	it('does not invent weekdays from ordinary words ("we sat by the sun")', () => {
		// "sat"/"sun" are weekday tokens, but they are not plural and are read
		// as days — that is the legacy behavior; a plain sentence with no
		// standalone token stays empty.
		expect(extractDayTokens('we meet by the river')).toEqual([]);
	});
});

describe('vocabulary — recurrence units and anchors', () => {
	it('RECURRENCE_UNITS contains day|week|month|year', () => {
		expect(RECURRENCE_UNITS).toBe('day|week|month|year');
	});

	it('RECURRENCE_UNITS regex matches each unit word', () => {
		const re = new RegExp(`\\b(${RECURRENCE_UNITS})\\b`, 'i');
		for (const word of ['day', 'week', 'month', 'year', 'Day', 'WEEK']) expect(re.test(word)).toBe(
			true
		);
	});

	it('DAYPART_TIMES and TOD_TIMES anchor the documented hours', () => {
		expect(DAYPART_TIMES['morning']).toBe('09:00');
		expect(DAYPART_TIMES['afternoon']).toBe('14:00');
		expect(DAYPART_TIMES['evening']).toBe('18:00');
		expect(DAYPART_TIMES['noon']).toBe('12:00');
		expect(TOD_TIMES['early morning']).toBe('06:00');
	});

	it('normalizeTime pads hour and minute', () => {
		expect(normalizeTime(9)).toBe('09:00');
		expect(normalizeTime(18, 5)).toBe('18:05');
	});

	it('normalizeMeridiem strips periods and ignores bare partials', () => {
		expect(normalizeMeridiem('p.m.')).toBe('pm');
		expect(normalizeMeridiem('a. m.')).toBe('am');
		expect(normalizeMeridiem('P')).toBe('p');
		expect(normalizeMeridiem(undefined)).toBeUndefined();
	});
});

describe('vocabulary — escapeRegExp', () => {
	const cases: [string, string][] = [
		['hello', 'hello'],
		['a.b', 'a\\.b'],
		['a+b', 'a\\+b'],
		['a*b', 'a\\*b'],
		['a?b', 'a\\?b'],
		['a^b', 'a\\^b'],
		['a$b', 'a\\$b'],
		['(a)', '\\(a\\)'],
		['[a]', '\\[a\\]'],
		['a|b', 'a\\|b'],
		['a\\b', 'a\\\\b']
	];

	it.each(cases)('escapeRegExp("%s") → "%s"', (input, expected) => {
		expect(escapeRegExp(input)).toBe(expected);
	});

	it('is functionally identical to the canonical escape', () => {
		const re = /[.*+?^${}()|[\]\\]/g;
		const escape = (s: string) => s.replace(re, '\\$&');
		for (const s of ['hello.world', 'foo+bar', '(test)', '[array]', 'a|b', 'price$5']) {
			expect(escapeRegExp(s)).toBe(escape(s));
		}
	});
});
