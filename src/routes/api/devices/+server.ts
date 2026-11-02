import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import {
	registerDeviceToken,
	removeDeviceToken,
	DEVICE_PLATFORMS,
	MAX_DEVICE_TOKEN_LENGTH,
	type DevicePlatform
} from '$lib/server/services/devicePushService';
import { requireUserJson } from '$lib/server/utils/requireUser';

/**
 * Android FCM device registration (#272). Same auth as /api/tasks: Bearer
 * fp_ token (resolved in hooks) or session cookie.
 *
 *   POST   /api/devices {token, platform?:'android'} -> 200 {success:true}
 *   DELETE /api/devices {token}                      -> 200 {success:true}
 */
export type DevicesDeps = {
	registerDeviceToken: typeof registerDeviceToken;
	removeDeviceToken: typeof removeDeviceToken;
};

const defaultDeps: DevicesDeps = { registerDeviceToken, removeDeviceToken };

type Parsed = { token: string; platform: DevicePlatform } | { error: string };

function isPlatform(value: unknown): value is DevicePlatform {
	return DEVICE_PLATFORMS.some((p) => p === value);
}

function parseBody(body: unknown): Parsed {
	if (typeof body !== 'object' || body === null || !('token' in body)) {
		return { error: 'token is required' };
	}
	const token = typeof body.token === 'string' ? body.token.trim() : '';
	if (!token) return { error: 'token is required' };
	if (token.length > MAX_DEVICE_TOKEN_LENGTH) return { error: 'token is too long' };
	const platform = 'platform' in body && body.platform !== undefined ? body.platform : 'android';
	if (!isPlatform(platform)) return { error: "platform must be 'android'" };
	return { token, platform };
}

export const POST = async (event: RequestEvent, deps: DevicesDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const parsed = parseBody(await event.request.json().catch(() => null));
	if ('error' in parsed) return json({ error: parsed.error }, { status: 400 });

	await deps.registerDeviceToken(auth.user.id, parsed.token, parsed.platform);
	return json({ success: true });
};

export const DELETE = async (event: RequestEvent, deps: DevicesDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const parsed = parseBody(await event.request.json().catch(() => null));
	if ('error' in parsed) return json({ error: parsed.error }, { status: 400 });

	await deps.removeDeviceToken(auth.user.id, parsed.token);
	return json({ success: true });
};
