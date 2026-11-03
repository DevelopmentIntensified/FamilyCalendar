// Families list — every Family the user is a Family Member of, with the one
// stat that answers "is this family actually in use" and the plan usage the
// pill reads (issue 098: this loader used to answer with the member's FIRST
// `familyMembers` row, so a two-family user only ever saw one of them).
import { generateInviteCode, getFamilyMemberRole } from '$lib/server/db/actions/families';
import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/utils/requireUser';
import type { Actions, PageServerLoad } from './$types';
import { INVITE_MANAGER_ROLES, loadFamiliesOverview } from '$lib/server/services/familyData';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	// Shared with GET /api/families (#292 G10a).
	return await loadFamiliesOverview(user.id);
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
