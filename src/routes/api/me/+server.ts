import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';

/**
 * GET /api/me — the authenticated identity, for external clients:
 * tokens authenticate AS the token owner (TaskFocus spec), and the phone
 * needs its own id to react to `assignedTo` handoffs already addressed to
 * it. Members manage their email/name inside the app; nothing beyond the
 * name fields is exposed.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	return json({
		id: auth.user.id,
		firstName: auth.user.firstName ?? null,
		lastName: auth.user.lastName ?? null
	});
};
