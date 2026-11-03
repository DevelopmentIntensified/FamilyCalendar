import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { readJsonObject } from '$lib/server/utils/jsonBody';
import {
	defaultUpdateEmailDeps,
	requestEmailChange,
	type UpdateEmailDeps
} from '$lib/server/services/accountData';

const deps: UpdateEmailDeps = defaultUpdateEmailDeps(getUrl(), NOREPLYEMAIL, EMAILSECRET);

/**
 * POST /api/me/email `{email}` (#292 G14) — starts an email change exactly
 * as the account page's updateEmail does (3/15m throttle, guest refusal,
 * code mailed to the NEW address, confirmed on the web verify page).
 */
export const POST = async (
	event: Parameters<RequestHandler>[0],
	injected: UpdateEmailDeps = deps
): Promise<Response> => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(event.request);
	if (!body.ok) return body.response;
	const r = await requestEmailChange(
		event.request,
		auth.user.id,
		async () => (typeof body.value.email === 'string' ? body.value.email.trim() : ''),
		injected
	);
	if (!r.ok) {
		return json(
			{ error: r.message, ...(r.guestNeedsClaim ? { guestNeedsClaim: true } : {}) },
			{ status: r.status }
		);
	}
	return json({ success: true, message: r.message });
};
