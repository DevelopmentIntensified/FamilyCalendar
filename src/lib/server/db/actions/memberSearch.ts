import { and, eq, ilike, notInArray, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

/**
 * The create-page member search (issue 100).
 *
 * This is NOT `searchUsers` and must not grow into it. That one is exact-match
 * on purpose — a wildcard scan in the invite flow would let any family member
 * enumerate every verified user in the product one letter at a time. A picker
 * needs a type-ahead, so it gets its own door, and the enumeration guard is
 * carried here instead of being weakened there:
 *
 *   - a length floor, so a single letter is refused rather than scanned;
 *   - a row cap, so one query cannot return the table;
 *   - no ORDER BY, because an ordering leaks more than a match does
 *     (join order, or a position in an alphabetical list);
 *   - verified users only, never the caller, never anyone already picked.
 *
 * The bounds live here as exported constants so the door and the query read the
 * same numbers rather than each keeping their own copy.
 */

/** Shortest term the search will run. One letter is an enumeration tool. */
export const MEMBER_SEARCH_MIN_QUERY = 2;

/** Longest term the search will run — nobody types 200 characters to find a kid. */
export const MEMBER_SEARCH_MAX_QUERY = 60;

/** Most rows one search will ever return. */
export const MEMBER_SEARCH_ROW_CAP = 10;

/** One person a picker can choose. */
export interface MemberSearchHit {
	id: string;
	firstName: string | null;
	lastName: string | null;
	email: string | null;
}

export type MemberSearchResult =
	| { ok: true; users: MemberSearchHit[] }
	| { ok: false; reason: 'too-short' | 'too-long' };

/**
 * Escape ILIKE wildcards so a search term only matches itself — otherwise a
 * crafted `%` turns the prefix into a full scan, which is the whole thing the
 * invite-flow door refuses to be. Copied rather than imported from families.ts
 * so the two doors cannot be edited into one.
 */
function escapeIlike(value: string): string {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Verified users whose first name, last name or email starts with the term —
 * never the caller, never anyone in `excludeUserIds`.
 */
export async function findVerifiedUsersByPrefix(
	query: string,
	options: { callerId: string; excludeUserIds?: string[] }
): Promise<MemberSearchResult> {
	const term = query.trim();

	if (term.length < MEMBER_SEARCH_MIN_QUERY) return { ok: false, reason: 'too-short' };
	if (term.length > MEMBER_SEARCH_MAX_QUERY) return { ok: false, reason: 'too-long' };

	const prefix = `${escapeIlike(term)}%`;
	// The caller is always in the list, so notInArray never gets an empty array.
	const excluded = [options.callerId, ...(options.excludeUserIds ?? [])];

	const rows = await db
		.select({
			id: users.id,
			firstName: users.firstName,
			lastName: users.lastName,
			email: users.email
		})
		.from(users)
		.where(
			and(
				eq(users.emailVerified, true),
				notInArray(users.id, excluded),
				or(
					ilike(users.firstName, prefix),
					ilike(users.lastName, prefix),
					ilike(users.email, prefix)
				)
			)
		)
		.limit(MEMBER_SEARCH_ROW_CAP);

	return { ok: true, users: rows };
}
