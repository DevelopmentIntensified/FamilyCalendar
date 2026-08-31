export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

export interface PushSubscribeResult {
	ok: boolean;
	reason?: string;
}

/** User-facing copy for a failed enable attempt. */
export function pushFailureText(reason?: string): string {
	switch (reason) {
		case 'unsupported':
			return "This browser doesn't support push notifications.";
		case 'no-server-key':
			return "Push isn't configured on the server.";
		case 'permission-denied':
			return 'Notifications were blocked in browser settings.';
		case 'server-rejected':
			return 'The server rejected the subscription.';
		case 'no-service-worker':
			return "Push isn't ready yet — reload the page and try again.";
		case 'not-secure-context':
			return 'Push requires a secure (HTTPS) connection.';
		case 'subscribe-failed':
			return "Couldn't subscribe for push notifications.";
		case 'network-error':
			return 'Network error — check your connection and try again.';
		default:
			return "Couldn't enable notifications.";
	}
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const output = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) {
		output[i] = raw.charCodeAt(i);
	}
	return output;
}

export async function isPushSupported(): Promise<boolean> {
	if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
	return (
		'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
	);
}

async function getExistingSubscription(): Promise<PushSubscription | null> {
	if (!(await isPushSupported())) return null;
	const registration = await navigator.serviceWorker.getRegistration();
	if (!registration) return null;
	return registration.pushManager.getSubscription();
}

export async function getPushState(): Promise<PushState> {
	if (!(await isPushSupported())) return 'unsupported';
	if (Notification.permission === 'denied') return 'denied';
	const subscription = await getExistingSubscription();
	return subscription ? 'subscribed' : 'unsubscribed';
}

export async function getServerPublicKey(): Promise<string | null> {
	try {
		const res = await fetch('/api/push/public-key');
		if (!res.ok) {
			console.warn(`[push] public-key endpoint returned ${res.status}`);
			return null;
		}
		const data = await res.json();
		if (typeof data.publicKey === 'string' && data.publicKey.length > 0) {
			return data.publicKey;
		}
		console.warn('[push] public-key endpoint returned no publicKey');
		return null;
	} catch (error) {
		console.error('[push] fetch public-key failed', error);
		return null;
	}
}

export async function subscribeToPush(): Promise<PushSubscribeResult> {
	if (!(await isPushSupported())) {
		console.warn('[push] unsupported by this browser');
		return { ok: false, reason: 'unsupported' };
	}

	if (typeof window !== 'undefined' && !window.isSecureContext) {
		console.warn('[push] not a secure context — push requires HTTPS');
		return { ok: false, reason: 'not-secure-context' };
	}

	// Ask for permission FIRST, inside the click's transient-activation window.
	// The browser only shows the prompt while the user gesture is still live:
	// any real I/O before this (navigator.serviceWorker.ready, the network
	// fetch for the VAPID key) consumes the activation, so the browser silently
	// resolves the request as 'denied' — without showing the prompt and without
	// persisting the denial — which makes every click fail identically ("keeps
	// getting Couldn't enable notifications").
	const NotificationAPI = window.Notification;
	const permission =
		typeof NotificationAPI.requestPermission === 'function'
			? await NotificationAPI.requestPermission()
			: NotificationAPI.permission;
	if (permission !== 'granted') {
		console.warn(`[push] permission not granted: ${permission}`);
		return { ok: false, reason: 'permission-denied' };
	}

	// Resolve the registration from getRegistration() rather than awaiting
	// navigator.serviceWorker.ready: when no service worker is registered (e.g.
	// dev builds — the SW is only registered in production, see app.html), the
	// `.ready` promise never resolves and the call would hang forever.
	let registration: ServiceWorkerRegistration;
	try {
		const existing = await navigator.serviceWorker.getRegistration();
		if (!existing) {
			console.warn('[push] no service worker registered');
			return { ok: false, reason: 'no-service-worker' };
		}
		registration = existing;
	} catch (error) {
		console.error('[push] getRegistration failed', error);
		return { ok: false, reason: 'no-service-worker' };
	}

	const publicKey = await getServerPublicKey();
	if (!publicKey) {
		console.warn('[push] no VAPID public key from server');
		return { ok: false, reason: 'no-server-key' };
	}

	try {
		// Reuse a live subscription if one is already present — calling
		// subscribe() over an existing one throws InvalidStateError.
		let subscription = await registration.pushManager.getSubscription();
		if (!subscription) {
			subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(publicKey)
			});
		}

		const { endpoint, keys } = subscription.toJSON();

		let res: Response;
		try {
			res = await fetch('/api/push/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint, keys })
			});
		} catch (error) {
			console.error('[push] network error sending subscription', error);
			return { ok: false, reason: 'network-error' };
		}

		if (!res.ok) {
			console.error(`[push] server rejected subscription (${res.status})`);
			await subscription.unsubscribe().catch(() => {});
			return { ok: false, reason: 'server-rejected' };
		}
		return { ok: true };
	} catch (error) {
		console.error('[push] subscribe failed', error);
		return { ok: false, reason: 'subscribe-failed' };
	}
}

export async function unsubscribeFromPush(): Promise<void> {
	const subscription = await getExistingSubscription();
	if (!subscription) return;
	try {
		await fetch('/api/push/unsubscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ endpoint: subscription.endpoint })
		});
	} catch {
		// still remove locally so UI reflects intent
	}
	await subscription.unsubscribe().catch(() => {});
}
