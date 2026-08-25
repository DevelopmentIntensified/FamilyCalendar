import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveSubscription } from '$lib/server/services/pushService';
import { requireUserJson } from '$lib/server/utils/requireUser';

function isValidSubscription(body: unknown): body is {
	endpoint: string;
	keys: { p256dh: string; auth: string };
} {
	if (!body || typeof body !== 'object') return false;
	const b = body as Record<string, unknown>;
	const keys = b.keys as Record<string, unknown> | undefined;
	return (
		typeof b.endpoint === 'string' &&
		b.endpoint.length > 0 &&
		!!keys &&
		typeof keys.p256dh === 'string' &&
		keys.p256dh.length > 0 &&
		typeof keys.auth === 'string' &&
		keys.auth.length > 0
	);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const body = await request.json().catch(() => null);
	if (!isValidSubscription(body)) {
		return json({ error: 'Invalid subscription payload' }, { status: 400 });
	}

	await saveSubscription(auth.user.id, {
		endpoint: body.endpoint,
		keys: { p256dh: body.keys.p256dh, auth: body.keys.auth }
	});

	return json({ success: true });
};
