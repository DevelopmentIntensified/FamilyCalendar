import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { readJsonObject } from '$lib/server/utils/jsonBody';
import { updateProfile } from '$lib/server/services/accountData';
import { isRegisteredAccount } from '$lib/utils/anonymous';

/** PATCH /api/me/profile `{firstName,lastName}` (#292 G14) — the account page's updateProfile. */
export const PATCH: RequestHandler = async ({ locals, request }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(request);
	if (!body.ok) return body.response;
	const firstName = typeof body.value.firstName === 'string' ? body.value.firstName.trim() : '';
	const lastName = typeof body.value.lastName === 'string' ? body.value.lastName.trim() : '';
	const r = await updateProfile(auth.user.id, firstName, lastName);
	if (!r.ok) return json({ error: r.message }, { status: r.status });
	return json({
		success: true,
		user: {
			id: auth.user.id,
			firstName,
			lastName,
			// The guest placeholder email never leaves the server.
			email: isRegisteredAccount(auth.user) ? auth.user.email : null
		}
	});
};
