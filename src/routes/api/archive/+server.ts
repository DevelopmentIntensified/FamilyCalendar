import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { loadArchive } from '$lib/server/services/archiveData';

/** GET /api/archive (#292 G16) — the /calendar/archive page's data (loadArchive). */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	return json(await loadArchive(auth.user.id));
};
