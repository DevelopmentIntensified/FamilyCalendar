/**
 * family search repo: the two people-search doors and the verified-account
 * check, over the `users` table (a declared read-only join, rule R3,
 * `FOREIGN_READS.family`) and `familyMembers` (to leave current members out).
 *
 * The two doors are SEPARATE queries on purpose and must never become one
 * (`family.search.rules.ts`): the picker is a bounded prefix type-ahead, the
 * invite flow an exact-match lookup. Both return the full address; masking is
 * the service's call (`maskEmail`), the SQL shape is the repo's. The patterns
 * come from `likePrefix` / `likeExact`, so the wildcard escaping has one home
 * and the repo cannot forget it.
 *
 * Each function takes `db: Db` first, contains no authorization (the length
 * floor and ceiling, the rate limit and the family check live in the rules and
 * the service) and reads no clock.
 *
 * Doc: ./README.md#invariants
 */
import { and, eq, ilike, inArray, notInArray, or } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import { familyMembers, users } from '$lib/kernel/db/tables.server';
import type { InvitableUser, MemberSearchHit } from './family.contract';
import { likeExact, likePrefix, MEMBER_SEARCH_ROW_CAP } from './family.search.rules';

/** What the picker asked for. */
export type PrefixSearch = {
	/** Already trimmed and length-checked (`searchTermProblem`). */
	readonly term: string;
	/** The caller and everyone already picked; empty is fine. */
	readonly excludeUserIds: readonly string[];
};

/**
 * The picker's query, unexecuted: verified accounts whose first name, last name
 * or email STARTS WITH the term (case-insensitive, wildcards escaped), never an
 * excluded id, capped at `MEMBER_SEARCH_ROW_CAP`, with NO `ORDER BY` — an
 * ordering would leak more than a match does. Exposed as a builder so a test
 * can read the SQL (`.toSQL()`) and hold the repo to the enumeration guard.
 */
export function prefixSearchQuery(db: Db, search: PrefixSearch) {
	const prefix = likePrefix(search.term);
	return db
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
				search.excludeUserIds.length > 0
					? notInArray(users.id, [...search.excludeUserIds])
					: undefined,
				or(ilike(users.firstName, prefix), ilike(users.lastName, prefix), ilike(users.email, prefix))
			)
		)
		.limit(MEMBER_SEARCH_ROW_CAP);
}

/** Run the picker's prefix search. Full addresses come back; the service masks them. */
export async function findVerifiedUsersByPrefix(
	db: Db,
	search: PrefixSearch
): Promise<MemberSearchHit[]> {
	return await prefixSearchQuery(db, search);
}

/**
 * What the invite flow asked for: the family whose members are left out, and
 * the three exact terms. The service decides what the terms are: today both
 * name columns are compared to the whole query (owner question Q-028, answered
 * B for after S6, splits the query instead). Either way the lookup stays an
 * exact match.
 */
export type InvitableLookup = {
	readonly familyId: string;
	readonly email: string;
	readonly firstName: string;
	readonly lastName: string;
};

/**
 * The invite flow's lookup. Every leg is EXACT (case-insensitive, no wildcard):
 * the email equals `email`, OR the first name equals `firstName` AND the last
 * name equals `lastName`. Verified accounts only, current members of
 * `familyId` left out, capped at `MEMBER_SEARCH_ROW_CAP`, unordered. A
 * substring or prefix scan here would be an enumeration oracle.
 */
export async function findInvitableUsers(
	db: Db,
	lookup: InvitableLookup
): Promise<InvitableUser[]> {
	const email = likeExact(lookup.email);
	const firstName = likeExact(lookup.firstName);
	const lastName = likeExact(lookup.lastName);
	return await db
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
				notInArray(
					users.id,
					db
						.select({ userId: familyMembers.userId })
						.from(familyMembers)
						.where(eq(familyMembers.familyId, lookup.familyId))
				),
				or(ilike(users.email, email), and(ilike(users.firstName, firstName), ilike(users.lastName, lastName)))
			)
		)
		.limit(MEMBER_SEARCH_ROW_CAP);
}

/**
 * Which of these ids are real, email-verified accounts: the check a crafted
 * create post meets before anyone is written into a family. Unknown and
 * unverified ids are simply absent. An empty list answers an empty set without
 * a query.
 */
export async function listVerifiedUserIds(
	db: Db,
	userIds: readonly string[]
): Promise<ReadonlySet<string>> {
	if (userIds.length === 0) return new Set();
	const rows = await db
		.select({ id: users.id })
		.from(users)
		.where(and(inArray(users.id, [...userIds]), eq(users.emailVerified, true)));
	return new Set(rows.map((row) => row.id));
}
