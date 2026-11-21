/**
 * Pure search rules: normalization, the AND predicate over title/description/
 * location, and the count the toolbar's status line reads. Expected values come
 * from the legacy table `src/lib/utils/calendarSearch.test.ts` and the README
 * Invariants, never from running this code.
 *
 * Doc: ./README.md#the-reading-filters
 */
import { describe, expect, it } from 'vitest';
import {
	byCalendarSearch,
	countCalendarMatches,
	normaliseCalendarQuery,
	type CalendarSearchableRow
} from './calendarPage.search.rules';

/** A row as the grid holds it: a title, and the two free-text fields it may
 *  or may not have. Deliberately named, so a fixture cannot drift into a
 *  shape nothing else in the app produces. */
interface Fixture extends CalendarSearchableRow {
	id: string;
}

function row(over: Partial<Fixture> = {}): Fixture {
	return { id: 'e1', title: 'Piano lesson', description: null, location: null, ...over };
}

describe('normaliseCalendarQuery', () => {
	it('trims and collapses whitespace, so a stray space is not a filter', () => {
		expect(normaliseCalendarQuery('  piano   lesson ')).toBe('piano lesson');
		expect(normaliseCalendarQuery('\tpiano\n')).toBe('piano');
	});

	it('an empty query is an empty query — the empty state, not a match-nothing', () => {
		expect(normaliseCalendarQuery('')).toBe('');
		expect(normaliseCalendarQuery('   ')).toBe('');
	});
});

describe('byCalendarSearch', () => {
	const rows = [
		row(),
		row({ id: 'e2', title: 'Football practice', location: 'Memorial Park' }),
		row({ id: 'e3', title: "Mia's permission slip", description: 'Due Friday, return signed' }),
		row({ id: 'e4', title: null, description: null, location: null })
	];

	it('an empty query keeps everything', () => {
		expect(byCalendarSearch(rows, '')).toHaveLength(4);
		expect(byCalendarSearch(rows, '   ')).toHaveLength(4);
	});

	it('matches the title, case-insensitively', () => {
		expect(byCalendarSearch(rows, 'piano')).toEqual([rows[0]]);
		expect(byCalendarSearch(rows, 'PIANO')).toEqual([rows[0]]);
	});

	it('matches the location too — a place is a thing you search for', () => {
		expect(byCalendarSearch(rows, 'memorial')).toEqual([rows[1]]);
	});

	it('matches inside a description, not just at its start', () => {
		expect(byCalendarSearch(rows, 'return signed')).toEqual([rows[2]]);
	});

	it('takes several words, and every one of them has to match', () => {
		expect(byCalendarSearch(rows, 'football')).toEqual([rows[1]]);
		expect(byCalendarSearch(rows, 'football park')).toEqual([rows[1]]);
		// AND, not OR: a query that only half matches finds nothing.
		expect(byCalendarSearch(rows, 'football piano')).toEqual([]);
	});

	it('never throws on a null title, description or location', () => {
		expect(() => byCalendarSearch(rows, 'anything')).not.toThrow();
		expect(byCalendarSearch(rows, 'anything')).toEqual([]);
	});

	it('a partial word is enough — you type as you go', () => {
		expect(byCalendarSearch(rows, 'perm')).toEqual([rows[2]]);
	});
});

describe('countCalendarMatches', () => {
	it('counts what a query would keep, and all of it when there is no query', () => {
		const rows = [row(), row({ id: 'e2', title: 'Piano exam' })];
		expect(countCalendarMatches(rows, '')).toBe(2);
		expect(countCalendarMatches(rows, 'piano')).toBe(2);
		expect(countCalendarMatches(rows, 'exam')).toBe(1);
	});
});
