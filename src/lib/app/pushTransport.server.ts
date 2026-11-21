/**
 * Real `Push`: the two transports the legacy `pushService` and `fcmService`
 * wrap — `web-push` (VAPID) and the Firebase Cloud Messaging HTTP v1 sender —
 * behind the kernel `Push` port. It lives here, not in the kernel, because it
 * imports legacy code (allowed in app only, rule R14).
 *
 * Config is a parameter, never `process.env` (rule R6): appCtx reads
 * `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and
 * `FCM_SERVICE_ACCOUNT_JSON` and builds this adapter. The transports are
 * injectable so its test never touches the network.
 *
 * TRANSITION BRIDGE: `createFcmSender` is the legacy FCM transport; alerts'
 * S5 can drop it only if the kernel grows its own sender.
 *
 * Doc: src/lib/app/README.md, src/lib/kernel/README.md#push
 */
import webpushModule from 'web-push';
import type {
	FcmBody,
	Push,
	PushDelivery,
	PushMessage,
	PushNotice,
	WebPushSubscription
} from '$lib/kernel/push/push';
import { z } from '$lib/kernel/validation/validators';
import {
	createFcmSender,
	parseServiceAccount,
	type FcmSender
} from '$lib/server/services/fcmService';

export type PushTransportConfig = {
	/** `VAPID_PUBLIC_KEY`; also the key `GET /api/push/public-key` answers. */
	readonly vapidPublicKey: string | null;
	/** `VAPID_PRIVATE_KEY`; web push stays off unless both halves are set. */
	readonly vapidPrivateKey: string | null;
	/** `VAPID_SUBJECT`, the legacy `mailto:` default. */
	readonly vapidSubject: string;
	/** `FCM_SERVICE_ACCOUNT_JSON`: the service-account key, raw JSON or base64 of it. */
	readonly fcmServiceAccount: string | null;
};

/** The subset of `web-push` this adapter calls (the module ships no types; see the legacy `.d.ts`). */
export type WebPushTransport = {
	sendNotification(
		subscription: {
			readonly endpoint: string;
			readonly keys: { readonly p256dh: string; readonly auth: string };
		},
		payload?: string | null,
		options?: {
			readonly vapidDetails?: {
				readonly subject: string;
				readonly publicKey: string;
				readonly privateKey: string;
			};
		}
	): Promise<void>;
};

export type PushTransportDeps = {
	readonly webpush?: WebPushTransport;
	/** The FCM sender; `null` means unconfigured. Omitted: built from `fcmServiceAccount`. */
	readonly fcm?: FcmSender | null;
	/** The FCM sender's token exchange. */
	readonly fetch?: typeof fetch;
};

/** A Web Push error that means the browser's subscription is gone (404/410). */
const WEB_PUSH_GONE = z.object({ statusCode: z.union([z.literal(404), z.literal(410)]) });

// web-push ships no runtime types (the legacy services/web-push.d.ts pins a looser shape), so pin the
// subset this adapter calls. SAFETY: the declared module exposes sendNotification with this contract.
const webpush = webpushModule as WebPushTransport;

export function createPushTransport(
	config: PushTransportConfig,
	deps: PushTransportDeps = {}
): Push {
	const transport: WebPushTransport = deps.webpush ?? webpush;
	const fetchImpl: typeof fetch = deps.fetch ?? ((...args) => fetch(...args));
	const fcm: FcmSender | null =
		deps.fcm !== undefined ? deps.fcm : buildFcmSender(config.fcmServiceAccount, fetchImpl);

	async function sendWeb(
		subscription: WebPushSubscription,
		notice: PushNotice
	): Promise<PushDelivery> {
		const publicKey = config.vapidPublicKey;
		const privateKey = config.vapidPrivateKey;
		if (!publicKey || !privateKey) return 'skipped';

		try {
			await transport.sendNotification(
				{
					endpoint: subscription.endpoint,
					keys: { p256dh: subscription.p256dh, auth: subscription.auth }
				},
				JSON.stringify(notice),
				{
					vapidDetails: {
						subject: config.vapidSubject,
						publicKey,
						privateKey
					}
				}
			);
			return 'sent';
		} catch (error) {
			if (WEB_PUSH_GONE.safeParse(error).success) return 'dead';
			console.error('Failed to send push notification:', error);
			return 'failed';
		}
	}

	async function sendDevice(token: string, body: FcmBody): Promise<PushDelivery> {
		if (!fcm) return 'skipped';
		const result = await fcm.send(token, body);
		return result === 'unregistered' ? 'dead' : result;
	}

	return {
		webPublicKey: () => config.vapidPublicKey,
		devicesConfigured: () => fcm !== null,
		send: async (message: PushMessage): Promise<PushDelivery> =>
			message.channel === 'web'
				? sendWeb(message.subscription, message.notice)
				: sendDevice(message.token, message.body)
	};
}

function buildFcmSender(raw: string | null, fetchImpl: typeof fetch): FcmSender | null {
	const account = parseServiceAccount(raw ?? undefined);
	if (!account) return null;
	return createFcmSender(account, { fetch: fetchImpl, now: () => Date.now() });
}
