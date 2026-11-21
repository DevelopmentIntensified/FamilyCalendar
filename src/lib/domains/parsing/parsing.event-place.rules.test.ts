/**
 * The location ladder, the five-word place grammar, calendar targeting and
 * the attendant ladder. Traced from `:309-470,1612-1901`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { matchGoPlacePhrase, matchPlacePhrase, readPlacePhrase } from './parsing.event-place.rules';
import { parseEventQuickAdd } from './parsing.event.rules';

const NOW = new Date(Date.UTC(2026, 6, 15, 14, 30));

function parsed(input: string): ReturnType<typeof parseEventQuickAdd>['parsed'] {
	return parseEventQuickAdd(input, { now: NOW, zone: 'UTC' }).parsed;
}

describe('place grammar — five words, terminators, head blocklist', () => {
	it('reads at most five words', () => {
		expect(readPlacePhrase('one two three four five six seven', 0)?.place).toBe(
			'one two three four five'
		);
	});

	it('a first word that is an article, home, daypart, meal or clock is no place', () => {
		for (const head of ['the', 'home', 'noon', 'lunch', '8', '2pm', 'my']) {
			expect(readPlacePhrase(`${head} place`, 0), head).toBeNull();
		}
	});

	it('stops at a schedule preposition, a conjunction and a day word', () => {
		expect(readPlacePhrase('annex on monday', 0)?.place).toBe('annex');
		expect(readPlacePhrase('annex with george', 0)?.place).toBe('annex');
		expect(readPlacePhrase('annex this friday', 0)?.place).toBe('annex');
	});

	it('stops when a clock shape starts mid-place', () => {
		expect(readPlacePhrase('ccl 6-8pm', 0)?.place).toBe('ccl');
	});

	it('consumes a lowercase article but never starts a place on one', () => {
		expect(matchPlacePhrase('dinner at the Olive Garden')?.place).toBe('Olive Garden');
		// A capital "The" is proper-name text, so the grammar refuses to start
		// there and the compromise fallback keeps the article (issue 108).
		expect(matchPlacePhrase('dinner at The Olive Garden')).toBeNull();
	});

	it('"in" only reads a place with a lowercase article', () => {
		expect(matchPlacePhrase('dinner in the garden')?.place).toBe('garden');
		expect(matchPlacePhrase('dinner in 3 days')).toBeNull();
	});

	it('movement verbs read the same place grammar', () => {
		expect(matchGoPlacePhrase("we are heading to aunt ruth's")?.place).toBe("aunt ruth's");
		expect(matchGoPlacePhrase('he goes over to the range')).toBeNull();
	});
});

describe('location priority', () => {
	const rows: Array<[string, string | undefined]> = [
		['location: Zoom', 'Zoom'],
		['party at the annex on monday at 2pm', 'annex'],
		['meet at LU', 'LU'],
		['party at home', 'Home'],
		['party at my cabin', 'Cabin'],
		['party at my apartment on 42 Maple Drive', '42 Maple Drive'],
		['practice at the snow flex studio', 'snow flex studio'],
		['lunch at The Olive Garden', 'The Olive Garden'],
		['dinner in the garden', 'garden'],
		["we are heading to aunt ruth's", "aunt ruth's"]
	];

	it.each(rows)('%s → %s', (phrase, expected) => {
		expect(parsed(phrase).location).toBe(expected);
	});

	it('an explicit "location:" beats a place guess', () => {
		expect(parsed('location: Zoom\ndinner at the park').location).toBe('Zoom');
	});

	it('reads a full street address whole and strips trailing punctuation', () => {
		expect(parsed('drop off 442 cherry hill dr., rustburg, va 24588.').location).toBe(
			'442 cherry hill dr., rustburg, va 24588'
		);
	});

	it('an explicit "at <place>" keeps its span out of the title', () => {
		const result = parsed('meeting at the annex on monday at 2pm');
		expect(result.title).toBe('meeting');
		expect(result.location).toBe('annex');
	});

	it('does not read "at the" / "at noon" as places', () => {
		expect(parsed('meet at noon').location).toBeUndefined();
	});
});

describe('calendar targeting', () => {
	const rows: Array<[string, string | undefined]> = [
		['party on the family calendar', 'family calendar'],
		['party to my work calendar', 'work calendar'],
		['stalkers campout family calendar', 'family calendar'],
		['family calendar stalkers campout', 'family calendar'],
		['party personal calendar', 'personal calendar'],
		['budget calendar review', undefined],
		['family reunion saturday', undefined]
	];

	it.each(rows)('%s → %s', (phrase, expected) => {
		expect(parsed(phrase).calendarName).toBe(expected);
	});
});

describe('attendant priority', () => {
	it('a capitalized with-list is attendance', () => {
		expect(parsed('dinner with Nathaniel and Jamal').attendants).toEqual([
			'Nathaniel',
			'Jamal'
		]);
	});

	it('does not read non-name lists as attendants ("with pizza and drinks")', () => {
		expect(parsed('dinner with pizza and drinks').attendants).toBeUndefined();
	});

	it('an invite list is attendance and beats a guess', () => {
		expect(parsed('party invite Jane and Mo').attendants).toEqual(['Jane', 'Mo']);
	});

	it('a with-list running to the end of the title is removed from it', () => {
		const result = parsed('dinner with Nathaniel');
		expect(result.attendants).toEqual(['Nathaniel']);
		expect(result.title).toBe('dinner');
	});

	it('a mid-title with-list keeps its pin in the title', () => {
		const result = parsed('dinner with Nathaniel at the annex');
		expect(result.attendants).toEqual(['Nathaniel']);
		expect(result.title).toContain('Nathaniel');
	});

	it('group patterns read a whole group', () => {
		expect(parsed('meeting including the whole department').attendants).toEqual([
			'the whole department'
		]);
	});
});

describe('location phrase table (issue 108) — the whole class', () => {
	const LOCATION_PHRASES: Array<[string, string | undefined]> = [
		['running with george at snow flex on tuesday at 3pm', 'snow flex'],
		['coffee at blue bottle on friday at 9am', 'blue bottle'],
		['movie at school on friday', 'school'],
		['practice at soccer practice on wednesday at 5pm', 'soccer practice'],
		['lunch at blue bottle', 'blue bottle'],
		['grocery at whole foods', 'whole foods'],
		['run at snow flex', 'snow flex'],
		['hike at ridge trail', 'ridge trail'],
		['run at barn', 'barn'],
		['run at the old stone barn', 'old stone barn'],
		['run at neighborhood community clubhouse', 'neighborhood community clubhouse'],
		['meeting at the annex on monday at 2pm', 'annex'],
		['brunch at the corner cafe on saturday at 10am', 'corner cafe'],
		['party at the annex from 6pm to 9pm', 'annex'],
		['gym at the gym on tuesday', 'gym'],
		['wedding at the barn on june 3rd at 4pm', 'barn'],
		['dinner at the mall on friday', 'mall'],
		['pizza at the library', 'library'],
		['coffee at the downtown roastery', 'downtown roastery'],
		['run at the big red barn', 'big red barn'],
		['run at the neighborhood community clubhouse', 'neighborhood community clubhouse'],
		['picnic at Central Park', 'Central Park'],
		['race at Fort Fun', 'Fort Fun'],
		['lunch at The Olive Garden', 'The Olive Garden'],
		['run at Route 9 Park', 'Route 9 Park'],
		['meet at Room 201', 'Room 201'],
		['dinner at Route 66 Diner', 'Route 66 Diner'],
		["brunch at St. Mary's on saturday", "St. Mary's"],
		['coffee in the park on friday', 'park'],
		['meeting in the annex on monday at 2pm', 'annex'],
		['meeting in the big red barn on monday', 'big red barn'],
		['shopping in the downtown square', 'downtown square'],
		['walk in the neighborhood park on sunday', 'neighborhood park'],
		['party in the annex from 6pm to 9pm', 'annex'],
		['lunch at noon', undefined],
		['event beginning at dusk', undefined],
		['flash mob starting at noon and about 15 min', undefined],
		['meeting at 3pm for about 15 min', undefined],
		['meeting at 8 AM sharp', undefined],
		['yoga every Tuesday for 6 weeks at 6pm', undefined],
		['dentist tomorrow at 3pm remind me 30 min before', undefined],
		['team sync weekly on Mon & Wed at 9am', undefined],
		['flight Monday at 6am remind me 1 day before', undefined],
		['checkup in 3 days', undefined],
		['hike early morning', undefined],
		['run at the', undefined],
		['book club at the annex third thursday at 7pm', 'annex'],
		['meet at the annex next friday at 4pm', 'annex'],
		['movie night at home', 'Home'],
		['dinner at home on thursday at 7pm', 'Home'],
		['game night at my apartment', 'Apartment'],
		['sale at 450 Main Street', '450 Main Street'],
		['meeting at 742 evergreen terrace', '742 evergreen terrace'],
		['meeting at 12 oak st, springfield, il 62704', '12 oak st, springfield, il 62704'],
		['meeting location at the park', 'the park'],
		['Party at LU with friends', 'LU'],
		['team meeting Friday location: HQ', 'HQ'],
		[
			'a5pm disc golf at independence park. with jay and the league',
			'independence park'
		],
		[
			'running on friday at peaksview park at 5pm till 6pm with james and joseph repeat every week',
			'peaksview park'
		],
		[
			'We are doing a team building hiking trip early tomorrow morning, leaving at 6 AM and returning by 2 PM from the Blue Ridge Trailhead.',
			'Blue Ridge Trailhead'
		]
	];

	it.each(LOCATION_PHRASES)('"%s" → location %s', (phrase, expected) => {
		expect(parsed(phrase).location).toBe(expected);
	});
});

describe('location span never leaks into the title (issue 108)', () => {
	const TITLES: Array<[string, string]> = [
		['running with george at snow flex on tuesday at 3pm', 'running with george'],
		['coffee at blue bottle on friday at 9am', 'coffee'],
		['movie at school on friday', 'movie'],
		['practice at soccer practice on wednesday at 5pm', 'practice'],
		['run at snow flex', 'run'],
		['gym at the gym on tuesday', 'gym'],
		['meeting at the annex on monday at 2pm', 'meeting'],
		['brunch at the corner cafe on saturday at 10am', 'brunch'],
		['party at the annex from 6pm to 9pm', 'party'],
		['wedding at the barn on june 3rd at 4pm', 'wedding'],
		['dinner at the mall on friday', 'dinner'],
		['run at the big red barn', 'run'],
		['picnic at Central Park', 'picnic'],
		['run at Route 9 Park', 'run'],
		["brunch at St. Mary's on saturday", 'brunch'],
		['lunch at The Olive Garden', 'lunch'],
		['coffee in the park on friday', 'coffee'],
		['meeting in the annex on monday at 2pm', 'meeting'],
		['shopping in the downtown square', 'shopping'],
		['walk in the neighborhood park on sunday', 'walk']
	];

	it.each(TITLES)('"%s" → title "%s"', (phrase, expected) => {
		expect(parsed(phrase).title).toBe(expected);
	});
});
