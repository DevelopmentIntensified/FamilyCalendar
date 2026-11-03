import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadArchive } from '$lib/server/services/archiveData';

// The loader body is shared with GET /api/archive (#292 G16).
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}
	return await loadArchive(locals.user.id);
};
