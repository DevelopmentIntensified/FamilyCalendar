import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isAdminUser, loadAdminCounts } from '$lib/server/services/adminData';

// Role check + badge counts are shared with /api/admin/** (#292 G19).
export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	if (!isAdminUser(event.locals.user)) {
		return redirect(302, '/calendar');
	}
	// Nav badge counts degrade to 0 rather than 500ing every admin page.
	return await loadAdminCounts();
};
