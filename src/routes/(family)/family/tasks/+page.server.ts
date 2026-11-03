import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadFamilyTasks } from '$lib/server/services/familyData';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		return redirect(302, '/login');
	}
	// `?familyId=` addresses one family; without it the OLDEST family is chosen —
	// defined, rather than whatever `familyMembers` row the database hands back
	// (issue 098's bug class). Shared with GET /api/families/{id}/tasks (#292 G11).
	const board = await loadFamilyTasks(locals.user.id, url.searchParams.get('familyId'));
	if (!board) {
		return redirect(302, '/family');
	}
	return board;
};
