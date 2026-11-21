/**
 * family search services: the roster the calendar filters read, the create
 * page's prefix picker, and the invite flow's exact-match directory lookup.
 *
 * The two searches stay SEPARATE use-cases on purpose (`family.search.rules.ts`):
 * the picker is a bounded, unordered, masked type-ahead that needs no family,
 * while the invite flow answers only a member of the named family and matches
 * exactly. Merging them would turn one into an enumeration oracle.
 *
 * Authorization lives here; the SQL shape and the escaping live in the repo.
 *
 * Doc: ./README.md#public-interface
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { invalid } from '$lib/kernel/errors/appError';
import type { InvitableUser, MemberSearchHit, RosterMemberView } from './family.contract';
import { findMembershipFamilyId } from './family.families.repo.server';
import { memberRefusal } from './family.members.rules';
import { findMemberRole, listRoster } from './family.members.repo.server';
import { familyRefusalError } from './family.roles.rules';
import { findInvitableUsers, findVerifiedUsersByPrefix } from './family.search.repo.server';
import { maskEmail, searchTermProblem } from './family.search.rules';

/** `GET /api/family/roster`: the family the answer is for (null: none) and its members. */
export type FamilyRosterAnswer = {
	readonly familyId: string | null;
	readonly members: RosterMemberView[];
};

/** What the picker asked for: the typed term and the ids already chosen. */
export type MemberSearchInput = {
	readonly q: string;
	readonly exclude: readonly string[];
};

/** What the invite flow asked for: a term and the family it searches in. */
export type InvitableSearchInput = {
	readonly q: string;
	readonly familyId: string | null;
};

/**
 * `GET /api/family/roster`: a named family needs a membership (one 403, never
 * another family's roster); without one it answers the OLDEST family the caller
 * belongs to (Q-024 B), or `{familyId: null, members: []}`.
 */
export async function listFamilyRoster(
	ctx: Ctx,
	actor: Actor,
	familyId: string | null
): Promise<FamilyRosterAnswer> {
	if (familyId) {
		const refusal = memberRefusal('roster', await findMemberRole(ctx.db, actor.id, familyId));
		if (refusal) throw familyRefusalError(refusal);
		return { familyId, members: await listRoster(ctx.db, familyId) };
	}

	const fallback = await findMembershipFamilyId(ctx.db, actor.id);
	if (!fallback) return { familyId: null, members: [] };
	return { familyId: fallback, members: await listRoster(ctx.db, fallback) };
}

/**
 * `GET /api/family/member-search`: the picker. The term's bounds are refused
 * before a query is spent; verified accounts only, prefix match, the caller and
 * everyone already picked left out, ten rows, no ordering, masked addresses.
 */
export async function searchMembers(
	ctx: Ctx,
	actor: Actor,
	input: MemberSearchInput
): Promise<MemberSearchHit[]> {
	const problem = searchTermProblem(input.q);
	if (problem) throw invalid(problem);

	const rows = await findVerifiedUsersByPrefix(ctx.db, {
		term: input.q.trim(),
		excludeUserIds: [actor.id, ...input.exclude]
	});
	return rows.map((row) => ({
		id: row.id,
		firstName: row.firstName,
		lastName: row.lastName,
		email: row.email ? maskEmail(row.email) : null
	}));
}

/**
 * `GET /api/family/search`: the invite flow. A missing term or family answers
 * an empty list (Q-026); otherwise the caller must be a member of THAT family
 * and the lookup is exact (email, or both names equal to the whole term).
 */
export async function findInvitableMembers(
	ctx: Ctx,
	actor: Actor,
	input: InvitableSearchInput
): Promise<InvitableUser[]> {
	if (!input.q || !input.familyId) return [];

	const refusal = memberRefusal('search', await findMemberRole(ctx.db, actor.id, input.familyId));
	if (refusal) throw familyRefusalError(refusal);

	const term = input.q.trim();
	return await findInvitableUsers(ctx.db, {
		familyId: input.familyId,
		email: term,
		firstName: term,
		lastName: term
	});
}
