import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { loadStats } from '$lib/server/services/statsData';

/** GET /api/stats (#292 G15) — the /calendar/stats page's data (loadStats). */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	return json(await loadStats(auth.user.id));
};
