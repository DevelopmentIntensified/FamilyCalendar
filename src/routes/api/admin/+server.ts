import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadAdminCounts, requireAdminJson } from '$lib/server/services/adminData';

/** GET /api/admin (#292 G19) — the admin nav's open counts (the (admin) layout's). */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireAdminJson(locals);
	if (auth.response) return auth.response;
	return json(await loadAdminCounts());
};
