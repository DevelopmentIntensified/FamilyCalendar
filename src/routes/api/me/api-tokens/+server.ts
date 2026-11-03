import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { readJsonObject } from '$lib/server/utils/jsonBody';
import { listTokensForUser } from '$lib/server/db/actions/apiTokens';
import { mintNamedApiToken } from '$lib/server/services/accountData';

/** GET /api/me/api-tokens (#292 G14) — your tokens; the hash never leaves the server. */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	return json({ tokens: await listTokensForUser(auth.user.id) });
};

/** POST /api/me/api-tokens `{name}` — mints one; the plaintext is in this response only. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(request);
	if (!body.ok) return body.response;
	const r = await mintNamedApiToken(
		auth.user.id,
		typeof body.value.name === 'string' ? body.value.name : ''
	);
	if (!r.ok) return json({ error: r.message }, { status: r.status });
	return json({ token: r.token, record: r.record }, { status: 201 });
};
