import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { loadSubscriptionSummary } from '$lib/server/services/accountData';

/**
 * GET /api/me/subscription (#292 G14) — the account page's plan card
 * (display only; a read failure degrades to "no subscription" defaults).
 */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	return json(await loadSubscriptionSummary(auth.user.id));
};
