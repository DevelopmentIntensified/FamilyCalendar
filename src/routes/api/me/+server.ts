import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { isAnonymousAccount } from '$lib/utils/anonymous';
import { readJsonObject } from '$lib/server/utils/jsonBody';
import { deleteAccount } from '$lib/server/services/accountData';

/**
 * GET /api/me — the authenticated identity, for external clients:
 * tokens authenticate AS the token owner (TaskFocus spec), and the phone
 * needs its own id to react to `assignedTo` handoffs already addressed to
 * it. #292 G1 (additive): the shell flags the web layout reads from
 * `locals.user` (guest / verify banners, admin menu, `hasFamily`). Only the
 * caller's OWN row is ever returned; the guest placeholder email is masked
 * to null.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const user = auth.user;
	const isAnonymous = isAnonymousAccount(user);
	const familyId = await getUserFamilyId(user.id).catch(() => null);
	return json({
		id: user.id,
		firstName: user.firstName ?? null,
		lastName: user.lastName ?? null,
		email: isAnonymous ? null : (user.email ?? null),
		emailVerified: !!user.emailVerified,
		isAnonymous,
		roles: user.roles ?? [],
		lastActiveAt: user.lastActiveAt ? new Date(user.lastActiveAt).toISOString() : null,
		familyId: familyId ?? null
	});
};

/**
 * DELETE /api/me `{confirmation: <your user id>}` (#292 G14) — the account
 * page's deleteAccount: signs out every session and deletes the user (API
 * tokens cascade with the row, the caller's included).
 */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(request);
	if (!body.ok) return body.response;
	const confirmation = typeof body.value.confirmation === 'string' ? body.value.confirmation : '';
	const r = await deleteAccount(auth.user.id, confirmation, locals.session?.id ?? null);
	if (!r.ok) return json({ error: r.message }, { status: r.status });
	return json({ success: true });
};
