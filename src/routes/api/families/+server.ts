import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { loadFamiliesOverview } from '$lib/server/services/familyData';

/**
 * GET /api/families (#292 G10a) — the /family list: every family you are a
 * member of, the side-rail roster, live invite codes and plan usage
 * (loadFamiliesOverview).
 */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	return json(await loadFamiliesOverview(auth.user.id));
};
