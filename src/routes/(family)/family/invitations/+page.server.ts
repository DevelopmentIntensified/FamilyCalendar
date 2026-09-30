import { getUserFamilyMemberships } from '$lib/server/db/actions/families';
import { db } from '$lib/server/db';
import { familyInviteCodes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

// Minting/revoking invite codes is creator/admin-only (same gate as the
// /api/family/invite POST); members get an explanatory notice, not the UI.
const INVITE_MANAGER_ROLES = new Set(['creator', 'admin']);

export const load: PageServerLoad = async ({ locals, url }) => {
	const memberships = await getUserFamilyMemberships(locals.user.id);

	// `?familyId=` addresses one family; without it the OLDEST family is chosen.
	// Either way the choice is defined — this used to compare against the
	// user's first `familyMembers` row, so a creator of a second family saw
	// the wrong family's invites, or none at all (issue 098).
	const requested = url.searchParams.get('familyId');
	const chosen = memberships.find((m) => m.family.id === requested) ?? memberships[0] ?? null;

	if (!chosen) {
		return { invitations: [], canManageInvites: false, family: null, memberships: [] };
	}

	// The membership's own role is the permission ('creator' | 'admin' |
	// 'member'); memberType — the personal profile — is not.
	const canManageInvites = chosen.role !== null && INVITE_MANAGER_ROLES.has(chosen.role);

	const invites = canManageInvites
		? await db
				.select()
				.from(familyInviteCodes)
				.where(eq(familyInviteCodes.familyId, chosen.family.id))
		: [];

	return {
		invitations: invites,
		canManageInvites,
		family: chosen.family,
		memberships: memberships.map((m) => ({
			id: m.family.id,
			name: m.family.name,
			canManageInvites: m.role !== null && INVITE_MANAGER_ROLES.has(m.role)
		}))
	};
};
