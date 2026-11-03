import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { revokeApiToken } from '$lib/server/services/accountData';

/**
 * DELETE /api/me/api-tokens/{id} (#292 G14) — revokes one of YOUR tokens.
 * Scoped to the owner: another user's id deletes nothing (same 200, so ids
 * cannot be probed).
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const r = await revokeApiToken(auth.user.id, params.id);
	if (!r.ok) return json({ error: r.message }, { status: r.status });
	return json({ success: true });
};
