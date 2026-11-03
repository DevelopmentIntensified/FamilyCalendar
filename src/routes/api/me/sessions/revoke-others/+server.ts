import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { revokeOtherSessions } from '$lib/server/services/accountData';

/**
 * POST /api/me/sessions/revoke-others (#292 G14) — the account page's
 * "Log out other devices": every web session except the caller's own
 * cookie session (a Bearer caller has none, so all web sessions go). API
 * tokens — this app's included — are not sessions and stay valid; revoke
 * them one by one with DELETE /api/me/api-tokens/{id}.
 */
export const POST: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const r = await revokeOtherSessions(auth.user.id, locals.session?.id ?? null);
	if (!r.ok) return json({ error: r.message }, { status: r.status });
	return json({ success: true, revoked: r.revoked });
};
