import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listCategoryOptions } from '$lib/server/db/actions/taskCategories';
import { loadDashboard } from '$lib/server/services/dashboardData';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;
	// #283: the viewer's task categories for the board quick-add. Started
	// first so it overlaps the parent() read below; never throws (→ []).
	const categoriesP = listCategoryOptions(userId);

	// Settings + family scope come from the group layout (#042) — no refetch.
	const parentData = await event.parent();
	// The loader body is shared with GET /api/dashboard (#292 G8).
	return await loadDashboard({
		userId,
		userSettings: parentData.userSettings,
		familyId: parentData.familyId,
		familyMembers: parentData.familyMembers,
		dateParam: event.url.searchParams.get('date'),
		categoriesP
	});
};
