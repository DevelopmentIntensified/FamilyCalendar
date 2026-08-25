import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { removeSubscription } from '$lib/server/services/pushService';
import { requireUserJson } from '$lib/server/utils/requireUser';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (
		!body ||
		typeof body !== 'object' ||
		typeof (body as Record<string, unknown>).endpoint !== 'string' ||
		!(body as { endpoint: string }).endpoint
	) {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	await removeSubscription((body as { endpoint: string }).endpoint);

	return json({ success: true });
};
