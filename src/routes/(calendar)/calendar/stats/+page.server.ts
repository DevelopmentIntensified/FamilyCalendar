import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadStats } from '$lib/server/services/statsData';

/**
 * 093 rerun: the approved stats prototype reads `taskCompletions` - "the one
 * immutable table that exists only because the recurrence cursor overwrites
 * history" - and says so on the page. The body (#146: one counting path, one
 * streak definition) is shared with GET /api/stats (#292 G15).
 */
export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	return await loadStats(event.locals.user.id);
};
