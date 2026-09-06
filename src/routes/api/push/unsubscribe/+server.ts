import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { removeSubscription } from '$lib/server/services/pushService';

function isUnsubscribeBody(value: unknown): value is { endpoint: string } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'endpoint' in value &&
		typeof value.endpoint === 'string' &&
		value.endpoint.length > 0
	);
}

export const POST: RequestHandler = async ({ request }) => {
	const body: unknown = await request.json().catch(() => null);
	if (!isUnsubscribeBody(body)) {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	await removeSubscription(body.endpoint);

	return json({ success: true });
};
