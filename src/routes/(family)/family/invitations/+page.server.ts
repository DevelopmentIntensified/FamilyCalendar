import { requireUser } from '$lib/server/utils/requireUser';
import type { PageServerLoad } from './$types';
import { loadInvitations } from '$lib/server/services/familyData';

// Minting/revoking invite codes is creator/admin-only (same gate as the
// /api/family/invite POST); members get an explanatory notice, not the UI.
// `?familyId=` addresses one family; without it the OLDEST family is chosen
// (issue 098). Shared with GET /api/families/{id}/invite-codes (#292 G10c).
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	return await loadInvitations(user.id, url.searchParams.get('familyId'));
};
