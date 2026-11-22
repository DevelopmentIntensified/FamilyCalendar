/**
 * alerts push client: the browser half of Web Push — state, the permission
 * flow, subscribe/unsubscribe. Replaces `src/lib/utils/pushClient.ts`.
 *
 * Two rules from the legacy client are behaviour, not style:
 *
 * - **Permission is asked inside the click, before any I/O.** The browser only
 *   shows the prompt while the user gesture is still live; awaiting
 *   `serviceWorker.getRegistration()` or the VAPID key first consumes the
 *   activation, and the request silently resolves `denied` without a prompt.
 * - **The registration comes from `getRegistration()`**, never
 *   `navigator.serviceWorker.ready`: with no service worker registered (dev
 *   builds register it only in production) `.ready` never resolves and the
 *   click would hang.
 *
 * The environment is injected (`PushEnvironment`), so the flow is tested in
 * node with fakes and the component never touches `navigator` itself.
 *
 * Doc: ./README.md#public-interface
 */
import type { AlertsApi } from './alerts.api';

export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

/** Why an enable attempt did not finish; each has its own approved sentence. */
export type PushFailureReason =
	| 'unsupported'
	| 'not-secure-context'
	| 'permission-denied'
	| 'no-service-worker'
	| 'no-server-key'
	| 'subscribe-failed'
	| 'network-error'
	| 'server-rejected';

export type PushSubscribeResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: PushFailureReason };

/** The three calls the browser push flow needs; `alertsApi` satisfies it. */
export type AlertsPushApi = Pick<AlertsApi, 'publicKey' | 'subscribePush' | 'unsubscribePush'>;

export type PushSubscriptionKeys = { readonly p256dh: string; readonly auth: string };

/** A live browser subscription, normalised so no DOM type leaks into callers. */
export type BrowserPushSubscription = {
	readonly endpoint: string;
	readonly keys: PushSubscriptionKeys;
	unsubscribe(): Promise<unknown>;
};

/** The service worker's push manager, as the flow uses it. */
export type PushRegistration = {
	existing(): Promise<BrowserPushSubscription | null>;
	subscribe(applicationServerKey: Uint8Array): Promise<BrowserPushSubscription>;
};

/** Everything the flow needs from the browser, injected for tests. */
export type PushEnvironment = {
	supported(): boolean;
	secure(): boolean;
	permission(): NotificationPermission;
	requestPermission(): Promise<NotificationPermission>;
	registration(): Promise<PushRegistration | null>;
};

/** User-facing copy for a failed enable attempt (legacy wording, verbatim). */
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

/** Map a DOM subscription onto the flow's plain shape. */
function toBrowserSubscription(subscription: PushSubscription): BrowserPushSubscription {
	const json = subscription.toJSON();
	return {
		endpoint: json.endpoint ?? subscription.endpoint,
		keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
		unsubscribe: () => subscription.unsubscribe()
	};
}

/** The real browser environment; everything DOM-specific lives here. */
export function browserPushEnvironment(): PushEnvironment {
	return {
		supported: () =>
			typeof window !== 'undefined' &&
			typeof navigator !== 'undefined' &&
			'serviceWorker' in navigator &&
			'PushManager' in window &&
			'Notification' in window,
		secure: () => typeof window !== 'undefined' && window.isSecureContext,
		permission: () => (typeof Notification === 'undefined' ? 'default' : Notification.permission),
		requestPermission: async () => {
			if (
				typeof Notification === 'undefined' ||
				typeof Notification.requestPermission !== 'function'
			) {
				return 'default';
			}
			return Notification.requestPermission();
		},
		registration: async () => {
			// `getRegistration()` and not `.ready`: see the file header.
			const registration = await navigator.serviceWorker.getRegistration();
			if (!registration) return null;
			return {
				existing: async () => {
					const subscription = await registration.pushManager.getSubscription();
					return subscription ? toBrowserSubscription(subscription) : null;
				},
				subscribe: async (applicationServerKey) =>
					toBrowserSubscription(
						await registration.pushManager.subscribe({
							userVisibleOnly: true,
							applicationServerKey
						})
					)
			};
		}
	};
}

/** What the toggle shows: unsupported, blocked, subscribed or ready to enable. */
export async function getPushState(
	env: PushEnvironment = browserPushEnvironment()
): Promise<PushState> {
	if (!env.supported()) return 'unsupported';
	if (env.permission() === 'denied') return 'denied';
	try {
		const registration = await env.registration();
		const existing = registration ? await registration.existing() : null;
		return existing ? 'subscribed' : 'unsubscribed';
	} catch {
		return 'unsubscribed';
	}
}
