import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveSubscription } from '$lib/server/services/pushService';
import { requireUserJson } from '$lib/server/utils/requireUser';

function isValidSubscription(value: unknown): value is {
	endpoint: string;
	keys: { p256dh: string; auth: string };
} {
	return (
		typeof value === 'object' &&
		value !== null &&
		'endpoint' in value &&
		typeof value.endpoint === 'string' &&
		value.endpoint.length > 0 &&
		'keys' in value &&
		typeof value.keys === 'object' &&
		value.keys !== null &&
		'p256dh' in value.keys &&
		typeof value.keys.p256dh === 'string' &&
		value.keys.p256dh.length > 0 &&
		'auth' in value.keys &&
		typeof value.keys.auth === 'string' &&
		value.keys.auth.length > 0
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
