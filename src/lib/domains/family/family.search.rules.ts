/**
 * family search rules: the two people-search doors and the bounds that keep
 * them from being a user directory.
 *
 * - The create-page **picker** (`/api/family/member-search`) is a type-ahead:
 *   prefix match on first name, last name or email, verified accounts only,
 *   never the caller or anyone already picked, a length floor and ceiling, a
 *   row cap, no ordering (an ordering leaks more than a match does), and a
 *   masked email: enough to tell two people apart, not enough to harvest.
 * - The **invite flow** (`/api/family/search`) is exact-match on purpose: a
 *   substring scan there would let any family member enumerate every verified
 *   user one letter at a time.
 *
 * The two doors stay separate predicates (`isPickerMatch`, `isInviteFlowMatch`)
 * and must never be edited into one. Both predicates are the executable spec
 * the repo tests hold the SQL to.
 *
 * Doc: ./README.md#invariants
 */

/** Shortest term the picker will run. One letter is an enumeration tool. */
export const MEMBER_SEARCH_MIN_QUERY = 2;

/** Longest term the picker will run: nobody types 200 characters to find a kid. */
export const MEMBER_SEARCH_MAX_QUERY = 60;

/** Most rows one search will ever return, on either door. */
export const MEMBER_SEARCH_ROW_CAP = 10;

/** The person a search can find, as the users table holds them. */
export type SearchCandidate = {
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string | null;
};

/**
 * Enough of an address to tell two people apart (Sarah Mitchell from Sarah
 * Jones), not enough to harvest: first character, up to six dots, `@`, first
 * character of the domain, up to six dots. No `@` (or one at the very start)
 * is `•••`. The full address never reaches the picker; the invite still goes
 * to the real one.
 */
export function maskEmail(email: string): string {
	const at = email.lastIndexOf('@');
	if (at <= 0) return '•••';
	const local = email.slice(0, at);
	const domain = email.slice(at + 1);
	const dots = (length: number) => '•'.repeat(Math.max(0, Math.min(length, 6)));
	return `${local.slice(0, 1)}${dots(local.length - 1)}@${domain.slice(0, 1)}${dots(domain.length - 1)}`;
}

/**
 * Escape ILIKE wildcards so a term only matches itself: a crafted `%` would
 * otherwise turn a prefix into a full scan.
 */
export function escapeIlike(value: string): string {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** The picker's ILIKE pattern: the escaped term, then one trailing wildcard. */
export function likePrefix(term: string): string {
	return `${escapeIlike(term)}%`;
}

/** The invite flow's ILIKE pattern: the escaped, trimmed query and no wildcard at all. */
export function likeExact(query: string): string {
	return escapeIlike(query.trim());
}

/**
 * Why the picker refuses a term before spending a query, or null when it may
 * run. The floor is checked first, on the trimmed term, so whitespace is "too
 * short" and never a match.
 */
export function searchTermProblem(raw: string): string | null {
	const term = raw.trim();
	if (term.length < MEMBER_SEARCH_MIN_QUERY) {
		return `Type at least ${MEMBER_SEARCH_MIN_QUERY} characters to look someone up.`;
	}
	if (term.length > MEMBER_SEARCH_MAX_QUERY) return 'That search is too long.';
	return null;
}

function startsWithIgnoringCase(value: string | null, prefix: string): boolean {
	return value !== null && value.toLowerCase().startsWith(prefix.toLowerCase());
}

/**
 * The picker's matching rule: the (trimmed) term is a case-insensitive prefix
 * of the first name, the last name or the email. Wildcards in the term are
 * literal characters.
 */
export function isPickerMatch(candidate: SearchCandidate, term: string): boolean {
	return (
		startsWithIgnoringCase(candidate.firstName, term) ||
		startsWithIgnoringCase(candidate.lastName, term) ||
		startsWithIgnoringCase(candidate.email, term)
	);
}

function equalsIgnoringCase(value: string | null, other: string): boolean {
	return value !== null && value.toLowerCase() === other.toLowerCase();
}

/**
 * The invite flow's name terms (Q-028 B): the query split at its first run of
 * whitespace. Two tokens become a first and a last name; one token keeps the
 * legacy leg by standing for both columns (so "Sam" still finds Sam Sam); a
 * multi-word surname stays whole in the last term ("Ann van der Berg" is Ann +
 * "van der Berg"). The empty query keeps the legacy both-columns comparison,
 * which matches nobody unless a row's names are blank too.
 */
export function splitInviteName(query: string): { firstName: string; lastName: string } {
	const tokens = query.trim().split(/\s+/).filter((token) => token.length > 0);
	if (tokens.length === 0) return { firstName: '', lastName: '' };
	if (tokens.length === 1) return { firstName: tokens[0], lastName: tokens[0] };
	return { firstName: tokens[0], lastName: tokens.slice(1).join(' ') };
}

/**
 * The invite flow's matching rule (Q-028 B): the whole trimmed query equals the
 * email, or the split first and last name each equal their column exactly,
 * case-insensitively. Exact matching is kept, so the split opens no enumeration
 * oracle; a full name like "Ann Lee" now finds that person.
 */
export function isInviteFlowMatch(candidate: SearchCandidate, query: string): boolean {
	const exact = query.trim();
	const { firstName, lastName } = splitInviteName(exact);
	return (
		equalsIgnoringCase(candidate.email, exact) ||
		(equalsIgnoringCase(candidate.firstName, firstName) &&
			equalsIgnoringCase(candidate.lastName, lastName))
	);
}
