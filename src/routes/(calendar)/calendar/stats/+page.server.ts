import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTaskStats } from '$lib/server/db/actions/taskStats';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	return { stats: await getTaskStats(event.locals.user.id) };
};
