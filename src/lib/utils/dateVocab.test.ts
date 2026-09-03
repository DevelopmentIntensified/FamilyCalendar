import { describe, it, expect } from 'vitest';
import {
	MONTH_FULL, MONTH_ABBREV_INDEX, MONTH_FULL_INDEX,
	MONTH_INDEX_0, MONTH_INDEX_1, MONTH_ALT, MONTH_NAME_TOKEN,
	WEEKDAY_FULL, WEEKDAY_SHORT, DAY_ALT, WEEKDAY_TOKEN,
	RECURRENCE_UNITS, escapeRegExp
} from './dateVocab';

// ---------------------------------------------------------------------------
// Month vocabulary tests
// ---------------------------------------------------------------------------

describe('dateVocab — month names', () => {
	it('MONTH_FULL has exactly 12 entries, lowercase, January-first', () => {
		expect(MONTH_FULL).toHaveLength(12);
		expect(MONTH_FULL[0]).toBe('january');
		expect(MONTH_FULL[11]).toBe('december');
	});

	it('MONTH_FULL_INDEX maps every full name to its 0-based index', () => {
		const cases: [string, number][] = [
			['january', 0], ['february', 1], ['march', 2], ['april', 3],
			['may', 4], ['june', 5], ['july', 6], ['august', 7],
			['september', 8], ['october', 9], ['november', 10], ['december', 11]
		];
		for (const [name, idx] of cases) {
			expect(MONTH_FULL_INDEX[name]).toBe(idx);
		}
	});

	it('MONTH_ABBREV_INDEX maps all abbreviations to 0-based index', () => {
		const cases: [string, number][] = [
			['jan', 0], ['feb', 1], ['mar', 2], ['apr', 3],
			['may', 4], ['jun', 5], ['jul', 6], ['aug', 7],
			['sep', 8], ['sept', 8], ['oct', 9], ['nov', 10], ['dec', 11]
		];
		for (const [abbr, idx] of cases) {
			expect(MONTH_ABBREV_INDEX[abbr]).toBe(idx);
		}
	});

	it('MONTH_INDEX_0 is the union of full + abbrev, all 0-based', () => {
		// Full names
		expect(MONTH_INDEX_0['january']).toBe(0);
		expect(MONTH_INDEX_0['december']).toBe(11);
		// Abbreviations
		expect(MONTH_INDEX_0['jan']).toBe(0);
		expect(MONTH_INDEX_0['sept']).toBe(8);
		expect(MONTH_INDEX_0['sep']).toBe(8);
		expect(MONTH_INDEX_0['dec']).toBe(11);
	});

	it('MONTH_INDEX_1 is 1-based (MONTH_INDEX_0 + 1 for every key)', () => {
		for (const [k, v0] of Object.entries(MONTH_INDEX_0)) {
			expect(MONTH_INDEX_1[k]).toBe(v0 + 1);
		}
	});

	it('MONTH_ALT is longest-first (september before sep and sept)', () => {
		// NOTE: `indexOf` finds 'sept' inside 'september', so compare boundary-aware.
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

	it('MONTH_ALT regex matches the abbreviations it exposes (no jun/jul)', () => {
		// Matches the canonical dateParsing MONTH_ALT, which intentionally omits
		// "jun"/"jul" from the alternation (they exist in the index maps).
		const re = new RegExp(`\\b(${MONTH_ALT})\\b`, 'i');
		const abbrevs = ['jan', 'feb', 'mar', 'apr', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];
		for (const a of abbrevs) {
			expect(re.test(a)).toBe(true);
		}
		// And confirm jun/jul are NOT in MONTH_ALT (preserved server behaviour).
		expect(MONTH_ALT.split('|')).not.toContain('jun');
		expect(MONTH_ALT.split('|')).not.toContain('jul');
	});

	it('MONTH_NAME_TOKEN captures group works for all month tokens', () => {
		const re = new RegExp(`\\b${MONTH_NAME_TOKEN}\\b`, 'i');
		const tokens = [
			'jan', 'january', 'feb', 'february', 'mar', 'march',
			'apr', 'april', 'may', 'jun', 'june', 'jul', 'july',
			'aug', 'august', 'sep', 'sept', 'september',
			'oct', 'october', 'nov', 'november', 'dec', 'december'
		];
		for (const t of tokens) {
			const m = re.exec(t);
			expect(m).not.toBeNull();
			expect(m![1].toLowerCase()).toBe(t.toLowerCase());
		}
	});
});

// ---------------------------------------------------------------------------
// Weekday vocabulary tests
// ---------------------------------------------------------------------------

describe('dateVocab — weekday names', () => {
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
		expect(WEEKDAY_SHORT).toContain('sun');
		expect(WEEKDAY_SHORT).toContain('mon');
		expect(WEEKDAY_SHORT).toContain('tue');
		expect(WEEKDAY_SHORT).toContain('tues');
		expect(WEEKDAY_SHORT).toContain('wed');
		expect(WEEKDAY_SHORT).toContain('thu');
		expect(WEEKDAY_SHORT).toContain('thur');
		expect(WEEKDAY_SHORT).toContain('thurs');
		expect(WEEKDAY_SHORT).toContain('fri');
		expect(WEEKDAY_SHORT).toContain('sat');
	});

	it('WEEKDAY_TOKEN regex matches all full and short weekday names', () => {
		const re = new RegExp(`\\b${WEEKDAY_TOKEN}\\b`, 'i');
		const allTokens = [...WEEKDAY_FULL, ...WEEKDAY_SHORT];
		for (const t of allTokens) {
			expect(re.test(t)).toBe(true);
		}
	});

	it('WEEKDAY_TOKEN does not match partial words inside longer words', () => {
		const re = new RegExp(`\\b${WEEKDAY_TOKEN}\\b`, 'i');
		expect(re.test('mondays')).toBe(false); // plural not included
		expect(re.test('sundays')).toBe(false);
	});

	it('DAY_ALT does NOT match short forms (intentional — dateParsing uses only full)', () => {
		const re = new RegExp(`\\b(${DAY_ALT})\\b`, 'i');
		expect(re.test('mon')).toBe(false);
		expect(re.test('sun')).toBe(false);
		expect(re.test('fri')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Recurrence units
// ---------------------------------------------------------------------------

describe('dateVocab — recurrence units', () => {
	it('RECURRENCE_UNITS contains day|week|month|year', () => {
		expect(RECURRENCE_UNITS).toBe('day|week|month|year');
	});

	it('RECURRENCE_UNITS regex matches each unit word', () => {
		const re = new RegExp(`\\b(${RECURRENCE_UNITS})\\b`, 'i');
		expect(re.test('day')).toBe(true);
		expect(re.test('week')).toBe(true);
		expect(re.test('month')).toBe(true);
		expect(re.test('year')).toBe(true);
		expect(re.test('Day')).toBe(true);
		expect(re.test('WEEK')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// escapeRegExp
// ---------------------------------------------------------------------------

describe('dateVocab — escapeRegExp', () => {
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
		['a\\b', 'a\\\\b'],
	];

	it.each(cases)('escapeRegExp("%s") → "%s"', (input, expected) => {
		expect(escapeRegExp(input)).toBe(expected);
	});

	it('is functionally identical to the copy in dateParsing and taskQuickAdd', () => {
		// The canonical implementation: same regex and replacement.
		const re = /[.*+?^${}()|[\]\\]/g;
		const escape = (s: string) => s.replace(re, '\\$&');
		const testStrings = ['hello.world', 'foo+bar', '(test)', '[array]', 'a|b', 'price$5'];
		for (const s of testStrings) {
			expect(escapeRegExp(s)).toBe(escape(s));
		}
	});
});
