import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { removeSubscription } from '$lib/server/services/pushService';
import { requireUserJson } from '$lib/server/utils/requireUser';

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type UnsubscribeDeps = {
	removeSubscription: typeof removeSubscription;
};

const defaultDeps: UnsubscribeDeps = { removeSubscription };

function isUnsubscribeBody(value: unknown): value is { endpoint: string } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'endpoint' in value &&
		typeof value.endpoint === 'string' &&
		value.endpoint.length > 0
	);
}

export const POST = async (
	event: RequestEvent,
	deps: UnsubscribeDeps = defaultDeps
): Promise<Response> => {
	const { request, locals } = event;

	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const body: unknown = await request.json().catch(() => null);
	if (!isUnsubscribeBody(body)) {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	await deps.removeSubscription(auth.user.id, body.endpoint);

	return json({ success: true });
};
