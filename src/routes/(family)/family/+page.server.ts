// Families list — every Family the user is a Family Member of, with the one
// stat that answers "is this family actually in use" and the plan usage the
// pill reads (issue 098: this loader used to answer with the member's FIRST
// `familyMembers` row, so a two-family user only ever saw one of them).
import {
	generateInviteCode,
	getFamilyMemberRole,
	getUserFamilyMemberships
} from '$lib/server/db/actions/families';
import { getUserSubscriptionLimits } from '$lib/server/services/subscriptionService';
import { db } from '$lib/server/db';
import { familyInviteCodes, familyMembers, tasks, users } from '$lib/server/db/schema';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Minting an invite code is creator/admin-only — the same gate
// `/api/family/invite` and `members/add/direct` use. The membership ROLE is
// the permission; memberType (the personal profile) is not (ADR-0001).
const INVITE_MANAGER_ROLES = new Set(['creator', 'admin']);

export const load: PageServerLoad = async ({ locals }) => {
	const memberships = await getUserFamilyMemberships(locals.user.id);
	const familyIds = memberships.map((m) => m.family.id);

	// The card's stat: open Family Tasks per family — ONE grouped query for the
	// whole page, never one query per card (issue 078). "Open" is the Family
	// Task Board's own definition: not completed, not archived. Tasks are one
	// row each (Recurring Tasks included — no occurrence expansion), so the
	// count is honest rather than a raw event-row artefact.
	const openTaskRows = familyIds.length
		? await db
				.select({ familyId: tasks.familyId, openTasks: count() })
				.from(tasks)
				.where(
					and(
						inArray(tasks.familyId, familyIds),
						isNull(tasks.completedAt),
						isNull(tasks.archivedAt)
					)
				)
				.groupBy(tasks.familyId)
		: [];
	const openTasksByFamily = new Map(openTaskRows.map((row) => [row.familyId, row.openTasks]));

	// `family.html`'s side rail: a row per person — name, Member Type, role — and
	// the join code. ONE roster read for the whole page across every family the
	// viewer belongs to, so the rail costs the same for one family or five.
	const roster = familyIds.length
		? await db
				.select({
					familyId: familyMembers.familyId,
					userId: users.id,
					firstName: users.firstName,
					lastName: users.lastName,
					role: familyMembers.role,
					memberType: familyMembers.memberType
				})
				.from(users)
				.innerJoin(familyMembers, eq(users.id, familyMembers.userId))
				.where(inArray(familyMembers.familyId, familyIds))
				.orderBy(users.firstName)
		: [];

	// One code read for every family, filtered to the codes that can still be
	// used. `family-detail.html`'s band established the rule and this page holds
	// to it: an expired or used-up code is not an invitation, and presenting one
	// as live is worse than showing none.
	const codeRows = familyIds.length
		? await db
				.select({
					familyId: familyInviteCodes.familyId,
					code: familyInviteCodes.code,
					useCount: familyInviteCodes.useCount,
					maxUses: familyInviteCodes.maxUses,
					expiresAt: familyInviteCodes.expiresAt
				})
				.from(familyInviteCodes)
				.where(inArray(familyInviteCodes.familyId, familyIds))
		: [];
	const now = Date.now();
	const activeInvites = codeRows.filter(
		(row) =>
			new Date(row.expiresAt).getTime() > now &&
			(row.maxUses === null || (row.useCount ?? 0) < row.maxUses)
	);

	// Plan usage for the pill — the same familyLimit the create gate enforces,
	// counted the same way (family Memberships, not families created).
	const { familyLimit } = await getUserSubscriptionLimits(locals.user.id);

	return {
		families: memberships.map((m) => ({
			...m.family,
			memberCount: m.memberCount,
			openTasks: openTasksByFamily.get(m.family.id) ?? 0,
			// The approved card's roster strip — first names, so the card can show
			// WHO is in this family and not only how many (issue 124). The
			// userId rides along so each avatar can carry that person's own
			// colour, the way `family.html` draws `${m.tone}`.
			members: (m.firstNames ?? []).map((firstName, i) => ({
				firstName,
				userId:
					roster.find((r) => r.familyId === m.family.id && r.firstName === firstName)?.userId ??
					`roster-${i}`
			})),
			createdLabel: m.family.createdAt.toLocaleDateString(),
			// Whether THIS page offers "Invite by link" for the family (issue 091).
			canInvite: m.role !== null && INVITE_MANAGER_ROLES.has(m.role)
		})),
		roster,
		activeInvites,
		plan: { used: familyIds.length, limit: familyLimit }
	};
};

function formString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === 'string' ? value : '';
}

export const actions: Actions = {
	/**
	 * "Invite by link" (issue 091). Minting a code is a creator/admin action, so
	 * it is checked here rather than in the view: a plain member posting this
	 * form gets a refusal that says who may use it, and no code is written.
	 */
	mintInvite: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Sign in to invite someone to your family.' });
		}

		const familyId = formString(await request.formData(), 'familyId');
		if (!familyId) {
			return fail(400, { error: 'Pick the family to invite someone to.' });
		}

		const role = await getFamilyMemberRole(locals.user.id, familyId);
		if (!role) {
			return fail(403, { error: 'You are not a member of that family.' });
		}
		if (!INVITE_MANAGER_ROLES.has(role)) {
			return fail(403, {
				error: 'Only the family creator or an admin can invite someone by link.'
			});
		}

		const invite = await generateInviteCode(familyId, { createdBy: locals.user.id });

		return {
			familyId,
			inviteCode: invite.code,
			inviteUrl: `/family/join/${invite.code}`
		};
	}
};
