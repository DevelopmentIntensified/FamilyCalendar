import { json, type RequestEvent } from '@sveltejs/kit';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { readJsonObject } from '$lib/server/utils/jsonBody';
import { POST as webVerify } from '../../../(marketing)/signup/password/verify/+server';

/**
 * POST /api/me/verify-email `{code}` (#292 G12) — the web's
 * /signup/password/verify handler itself, for the CALLER's own email (the
 * web form posts the email; here it is the signed-in account's). Same
 * throttle, same generic error for any bad code.
 */
export const POST = async (event: RequestEvent): Promise<Response> => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(event.request);
	if (!body.ok) return body.response;
	const code = typeof body.value.code === 'string' ? body.value.code.trim() : '';
	if (!auth.user.email) return json({ error: 'Unauthorized' }, { status: 401 });
	// The throttle keys on the client IP header, so the forwarded request
	// keeps the original headers.
	const request = new Request(event.request.url, {
		method: 'POST',
		headers: event.request.headers,
		body: JSON.stringify({ code, email: auth.user.email })
	});
	// SAFETY: the web handler reads event.request only.
	return webVerify({ ...event, request } as never);
};
