import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { readJsonObject } from '$lib/server/utils/jsonBody';
import {
	defaultClaimRequestDeps,
	requestClaimLink,
	type ClaimRequestDeps
} from '$lib/server/services/claimRequest';

/**
 * POST /api/me/claim `{email}` (#292 G13) — a guest (Anonymous Account)
 * asks for the web claim link at an email; the /claim page's own
 * requestClaimLink. The answer never says whether the address is registered.
 */
export const POST = async (
	event: Parameters<RequestHandler>[0],
	deps: ClaimRequestDeps = defaultClaimRequestDeps
): Promise<Response> => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(event.request);
	if (!body.ok) return body.response;
	const result = await requestClaimLink(event.request, auth.user, async () => body.value.email, deps);
	if (!result.ok) return json({ error: result.error }, { status: result.status });
	return json({ sent: true });
};
