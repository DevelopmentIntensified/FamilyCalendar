import { describe, it, expect } from 'vitest';
import { bySearch, countMatches, normaliseQuery } from './calendarSearch';

// #120 mark 1.15 — "move this to the line below this". The field had nowhere to
// move to, because the shipped calendar had no search at all; the mark was
// about where search sits, not whether it exists. These pin what it matches,
// because a full-width field that quietly misses half of what a rail listed is
// worse than no field: it looks like an answer.

/** A row as the grid holds it: a title, and the two free-text fields it may
 *  or may not have. Deliberately named, so a fixture cannot drift into a
 *  shape nothing else in the app produces. */
interface Fixture {
	title: string | null;
	description: string | null;
	location: string | null;
}

function ev(over: Partial<Fixture> = {}): Fixture {
	return { title: 'Piano lesson', description: null, location: null, ...over };
}

describe('normaliseQuery', () => {
	it('trims and collapses whitespace, so a stray space is not a filter', () => {
		expect(normaliseQuery('  piano   lesson ')).toBe('piano lesson');
		expect(normaliseQuery('\tpiano\n')).toBe('piano');
	});

	it('an empty query is an empty query — the empty state, not a match-nothing', () => {
		expect(normaliseQuery('')).toBe('');
		expect(normaliseQuery('   ')).toBe('');
	});
});

describe('bySearch', () => {
	const events = [
		ev(),
		ev({ title: 'Football practice', location: 'Memorial Park' }),
		ev({ title: "Mia's permission slip", description: 'Due Friday, return signed' }),
		ev({ title: null, description: null, location: null })
	];

	it('an empty query keeps everything', () => {
		expect(bySearch(events, '')).toHaveLength(4);
		expect(bySearch(events, '   ')).toHaveLength(4);
	});

	it('matches the title, case-insensitively', () => {
		expect(bySearch(events, 'piano')).toEqual([events[0]]);
		expect(bySearch(events, 'PIANO')).toEqual([events[0]]);
	});

	it('matches the location too — a place is a thing you search for', () => {
		expect(bySearch(events, 'memorial')).toEqual([events[1]]);
	});

	it('matches inside a description, not just at its start', () => {
		expect(bySearch(events, 'return signed')).toEqual([events[2]]);
	});

	it('takes several words, and every one of them has to match', () => {
		// "football" alone is one hit; "football park" is the same event found
		// the way a person would say it.
		expect(bySearch(events, 'football')).toEqual([events[1]]);
		expect(bySearch(events, 'football park')).toEqual([events[1]]);
		// AND, not OR: a query that only half matches finds nothing.
		expect(bySearch(events, 'football piano')).toEqual([]);
	});

	it('never throws on a null title, description or location', () => {
		expect(() => bySearch(events, 'anything')).not.toThrow();
		expect(bySearch(events, 'anything')).toEqual([]);
	});

	it('a partial word is enough — you type as you go', () => {
		expect(bySearch(events, 'perm')).toEqual([events[2]]);
	});
});

describe('countMatches', () => {
	it('counts what a query would keep, and all of it when there is no query', () => {
		const events = [ev(), ev({ title: 'Piano exam' })];
		expect(countMatches(events, '')).toBe(2);
		expect(countMatches(events, 'piano')).toBe(2);
		expect(countMatches(events, 'exam')).toBe(1);
	});
});
