/**
 * alerts push subscribe — the click-time half of the browser push flow: the
 * permission call, the worker and VAPID key, subscribe-or-reuse, and the local
 * unsubscribe.
 *
 * Split from `alerts.push.api` for ADR 0010: the bell mounts and probes its
 * push state on every page (`getPushState`), but nothing here runs until the
 * person presses Enable or Turn off. Keeping it in `alerts.push.api` put the
 * base64 key decoder in every app page's first paint (~2.9 KB gzip, the
 * `base64` chunk). `AlertsBellState.enablePush`/`disablePush` import this file
 * lazily on that click.
 *
 * The two legacy rules still hold: permission is asked inside the gesture
 * before any other I/O, and the registration comes from `getRegistration()`.
 *
 * Doc: ./README.md#public-interface
 */
import { browserPushEnvironment } from './alerts.push.api';
import type {
	AlertsPushApi,
	BrowserPushSubscription,
	PushEnvironment,
	PushRegistration,
	PushSubscribeResult
} from './alerts.push.api';

/** Decode a URL-safe base64 VAPID key into the bytes `subscribe()` wants. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const output = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
	return output;
}

/**
 * Ask permission (inside the click), find the worker, read the key, then
 * subscribe and post the subscription. A subscription the server refuses is
 * dropped locally, so the next click starts clean.
 */
export async function subscribeToPush(
	api: AlertsPushApi,
	env: PushEnvironment = browserPushEnvironment()
): Promise<PushSubscribeResult> {
	if (!env.supported()) return { ok: false, reason: 'unsupported' };
	if (!env.secure()) return { ok: false, reason: 'not-secure-context' };

	// First await of the gesture: permission must ride the activation.
	const permission = await env.requestPermission();
	if (permission !== 'granted') return { ok: false, reason: 'permission-denied' };

	let registration: PushRegistration | null;
	try {
		registration = await env.registration();
	} catch {
		return { ok: false, reason: 'no-service-worker' };
	}
	if (!registration) return { ok: false, reason: 'no-service-worker' };

	const keyResult = await api.publicKey();
	const publicKey = keyResult.ok ? keyResult.data.publicKey : null;
	if (!publicKey) return { ok: false, reason: 'no-server-key' };

	try {
		// Reuse a live subscription: `subscribe()` over an existing one throws.
		const existing = await registration.existing();
		const subscription =
			existing ?? (await registration.subscribe(urlBase64ToUint8Array(publicKey)));
		const posted = await api.subscribePush({
			endpoint: subscription.endpoint,
			keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }
		});
		if (!posted.ok) {
			if (posted.status === 0) return { ok: false, reason: 'network-error' };
			await subscription.unsubscribe().catch(() => {});
			return { ok: false, reason: 'server-rejected' };
		}
		return { ok: true };
	} catch {
		return { ok: false, reason: 'subscribe-failed' };
	}
}

/** Drop the browser subscription and the server row; always removes locally. */
export async function unsubscribeFromPush(
	api: AlertsPushApi,
	env: PushEnvironment = browserPushEnvironment()
): Promise<void> {
	let subscription: BrowserPushSubscription | null = null;
	try {
		const registration = await env.registration();
		subscription = registration ? await registration.existing() : null;
	} catch {
		return;
	}
	if (!subscription) return;
	try {
		await api.unsubscribePush({ endpoint: subscription.endpoint });
	} catch {
		// Removing locally still reflects what the person asked for.
	}
	await subscription.unsubscribe().catch(() => {});
}
