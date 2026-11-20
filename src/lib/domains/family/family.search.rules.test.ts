/**
 * Pure search rules: the bounds, the masking, the two ILIKE patterns and the
 * two matching predicates (the picker's prefix rule and the invite flow's
 * exact rule, which must stay different). Carries the legacy
 * `memberSearch.test.ts` rule cases; expected values read off the README
 * Invariants and the legacy comments that explain them.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	escapeIlike,
	isInviteFlowMatch,
	isPickerMatch,
	likeExact,
	likePrefix,
	maskEmail,
	MEMBER_SEARCH_MAX_QUERY,
	MEMBER_SEARCH_MIN_QUERY,
	MEMBER_SEARCH_ROW_CAP,
	searchTermProblem,
	type SearchCandidate
} from './family.search.rules';

describe('the bounds that keep search from being a user directory', () => {
	// Legacy memberSearch.test.ts:209-211 (floor) and :182-187 (row cap).
	it('states the floor, the ceiling and the row cap as numbers both doors read', () => {
		expect(MEMBER_SEARCH_MIN_QUERY).toBe(2);
		expect(MEMBER_SEARCH_MAX_QUERY).toBe(60);
		expect(MEMBER_SEARCH_ROW_CAP).toBe(10);
	});
});

describe('maskEmail: enough to tell two people apart, not enough to harvest', () => {
	// Legacy memberSearch.test.ts:109-114 and :126-128.
	it.each<[string, string]>([
		['sarah.mitchell@gmail.com', 's••••••@g••••••'],
		[`${'a'.repeat(40)}@example.org`, 'a••••••@e••••••'],
		['ann@x.com', 'a••@x••••'],
		['a@b.co', 'a@b•••'],
		['', '•••'],
		['no-at-sign', '•••'],
		['@nolocal.com', '•••']
	])('maskEmail(%j) → %s', (email, expected) => {
		expect(maskEmail(email)).toBe(expected);
	});

	it('never echoes the address it was given', () => {
		const masked = maskEmail('ann.lee@example.com');
		expect(masked).not.toContain('ann.lee');
		expect(masked).not.toContain('example.com');
		expect(masked).toContain('•');
	});

	it('does not throw on an address that ends at the @', () => {
		expect(maskEmail('ann@')).toBe('a••@');
	});

	it('masks by the last @, so a quoted local part keeps its own @ out of the domain', () => {
		expect(maskEmail('"a@b"@x.com')).toBe('"••••@x••••');
	});
});

describe('escapeIlike and the two patterns', () => {
	it.each<[string, string]>([
		['ann', 'ann'],
		['a%n', 'a\\%n'],
		['a_n', 'a\\_n'],
		['a\\n', 'a\\\\n'],
		['100%_\\', '100\\%\\_\\\\']
	])('escapeIlike(%j) → %j', (value, expected) => {
		expect(escapeIlike(value)).toBe(expected);
	});

	// Legacy memberSearch.test.ts:132-157: a prefix, never a scan from both ends.
	it('likePrefix is the escaped term and one trailing wildcard', () => {
		expect(likePrefix('ann')).toBe('ann%');
		expect(likePrefix('a%n')).toBe('a\\%n%');
	});

	// Legacy families.test.ts:237-257: no % wrapping, so no enumeration oracle.
	it('likeExact trims, escapes and adds no wildcard at all', () => {
		expect(likeExact('  ann@x.com ')).toBe('ann@x.com');
		expect(likeExact('ann%@x.com')).toBe('ann\\%@x.com');
		expect(likeExact('ann')).not.toContain('%');
	});
});

describe('searchTermProblem', () => {
	const tooShort = `Type at least ${MEMBER_SEARCH_MIN_QUERY} characters to look someone up.`;

	// Legacy memberSearch.test.ts:160-181.
	it.each<[string, string, string | null]>([
		['an empty term', '', tooShort],
		['a single letter', 'a', tooShort],
		['a whitespace-only term (short, not a match)', '   ', tooShort],
		['one letter padded with spaces', '  a  ', tooShort],
		['the shortest allowed term', 'an', null],
		['a term padded to look long enough', ' a ', tooShort],
		['the longest allowed term', 'a'.repeat(MEMBER_SEARCH_MAX_QUERY), null],
		['an allowed term padded with spaces', `  ${'a'.repeat(MEMBER_SEARCH_MAX_QUERY)}  `, null],
		['one past the ceiling', 'a'.repeat(MEMBER_SEARCH_MAX_QUERY + 1), 'That search is too long.'],
		['an absurdly long term', 'a'.repeat(200), 'That search is too long.']
	])('%s → %j', (_what, raw, expected) => {
		expect(searchTermProblem(raw)).toBe(expected);
	});
});

describe('the picker matches a prefix, case-insensitively', () => {
	const ann: SearchCandidate = { firstName: 'Ann', lastName: 'Lee', email: 'ann.lee@example.com' };
	const noEmail: SearchCandidate = { firstName: 'Kid', lastName: 'Rowe', email: null };

	it.each<[string, SearchCandidate, string, boolean]>([
		['a first-name prefix', ann, 'an', true],
		['a first-name prefix in another case', ann, 'AN', true],
		['a last-name prefix', ann, 'le', true],
		['an email prefix', ann, 'ann.l', true],
		['the whole first name', ann, 'Ann', true],
		['a substring that is not a prefix', ann, 'nn', false],
		['the end of a name', ann, 'ee', false],
		['the domain of the email', ann, 'example', false],
		['a full name, which no single field starts with', ann, 'Ann Lee', false],
		['a candidate with no email, by name', noEmail, 'ki', true],
		['a candidate with no email, by something else', noEmail, 'kid@', false],
		['a literal percent sign (no wildcard)', ann, '%', false],
		['a literal underscore (no wildcard)', ann, '_', false]
	])('%s', (_what, candidate, term, expected) => {
		expect(isPickerMatch(candidate, term)).toBe(expected);
	});
});

describe('the invite flow matches exactly, never a prefix or a substring', () => {
	const ann: SearchCandidate = { firstName: 'Ann', lastName: 'Lee', email: 'ann@x.com' };
	const twin: SearchCandidate = { firstName: 'Lee', lastName: 'Lee', email: 'twin@x.com' };

	// Legacy families.test.ts:237-266 and the golden "matches an exact email only".
	it.each<[string, SearchCandidate, string, boolean]>([
		['the exact email', ann, 'ann@x.com', true],
		['the exact email in another case', ann, 'ANN@X.COM', true],
		['the exact email with padding', ann, '  ann@x.com ', true],
		['an email prefix', ann, 'ann@', false],
		['an email substring', ann, 'nn@x', false],
		['a first name alone', ann, 'Ann', false],
		['a last name alone', ann, 'Lee', false],
		['a full name (both columns compared to the whole query)', ann, 'Ann Lee', false],
		['a person whose first and last names both equal the query', twin, 'lee', true],
		['a wildcard', ann, '%', false],
		['an underscore standing in for a letter', ann, 'an_@x.com', false]
	])('%s', (_what, candidate, query, expected) => {
		expect(isInviteFlowMatch(candidate, query)).toBe(expected);
	});

	it('is a different rule from the picker: the same term can match one door and not the other', () => {
		const ann2: SearchCandidate = { firstName: 'Ann', lastName: 'Lee', email: 'ann@x.com' };
		expect(isPickerMatch(ann2, 'an')).toBe(true);
		expect(isInviteFlowMatch(ann2, 'an')).toBe(false);
	});
});
