import { getFamilyMemberRole, getUserFamilies } from '$lib/server/db/actions/families';
import { db } from '$lib/server/db';
import { familyInviteCodes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

// Minting/revoking invite codes is creator/admin-only (same gate as the
// /api/family/invite POST); members get an explanatory notice, not the UI.
const INVITE_MANAGER_ROLES = new Set(['creator', 'admin']);

export const load: PageServerLoad = async ({ locals }) => {
	const userFamilies = await getUserFamilies(locals.user.id);

	if (!userFamilies?.families) {
		return { invitations: [], canManageInvites: false, family: null };
	}

	const familyId = userFamilies.families.id;
	const role = await getFamilyMemberRole(locals.user.id, familyId);
	const canManageInvites = role !== null && INVITE_MANAGER_ROLES.has(role);

	const invites = canManageInvites
		? await db.select().from(familyInviteCodes).where(eq(familyInviteCodes.familyId, familyId))
		: [];

	return {
		invitations: invites,
		canManageInvites,
		family: userFamilies.families
	};
};
