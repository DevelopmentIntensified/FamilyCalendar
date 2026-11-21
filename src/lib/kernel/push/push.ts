/**
 * Push port + in-memory adapter. Services reach the two transports through
 * `ctx.push`, so no module imports `web-push` or the FCM bridge and a test
 * scripts what each send answers.
 *
 * One message per call — the port is a transport, never a fan-out: the caller
 * (alerts) owns its `pushSubscriptions` and `deviceTokens` rows, decides who
 * gets what, and deletes the target a `dead` result names. That keeps every
 * domain word out of the kernel, which is why `send` takes one web
 * subscription or one device token rather than a user.
 *
 * `dead` is the legacy prune signal in one word: a Web Push 404/410, and an
 * FCM `unregistered` token (404 / UNREGISTERED / a 400 that names the token).
 * `skipped` is a channel that is not configured — the legacy silent return —
 * and `failed` is a real error, logged where it happens (the legacy
 * `console.error` in the transports) so a caller never logs it twice.
 *
 * Doc: src/lib/kernel/README.md#push
 */

/** What a visible push says: the tray title and body, and the tap target. */
export type PushNotice = {
	readonly title: string;
	readonly body: string;
	readonly link?: string;
};

/** One browser subscription, as `pushSubscriptions` stores it. */
export type WebPushSubscription = {
	readonly endpoint: string;
	readonly p256dh: string;
	readonly auth: string;
};

/** The FCM v1 `message` body minus `token` (FCM has no multicast: one send per token). */
export type FcmBody = {
	readonly notification?: { readonly title: string; readonly body: string };
	/** FCM requires every `data` value to be a string. */
	readonly data?: Readonly<Record<string, string>>;
	readonly android?: {
		readonly priority?: 'high' | 'normal';
		readonly collapse_key?: string;
		readonly ttl?: string;
	};
};

/** One browser notification: the subscription to send to and what it says. */
export type WebPushMessage = {
	readonly channel: 'web';
	readonly subscription: WebPushSubscription;
	readonly notice: PushNotice;
};

/** One FCM message for one device token. */
export type DevicePushMessage = {
	readonly channel: 'device';
	readonly token: string;
	readonly body: FcmBody;
};

export type PushMessage = WebPushMessage | DevicePushMessage;

/** What one send did. Only `dead` makes the caller delete the target. */
export type PushDelivery = 'sent' | 'dead' | 'skipped' | 'failed';

export type Push = {
	/** The VAPID public key for the browser subscribe flow, or `null` when unset (`GET /api/push/public-key`). */
	webPublicKey(): string | null;
	/** Whether the FCM transport is configured at all — the legacy cheap gate for the silent nudge. */
	devicesConfigured(): boolean;
	/** Sends one message; never rejects (a failed channel answers `failed`). */
	send(message: PushMessage): Promise<PushDelivery>;
};

export type MemoryPush = Push & {
	/** Every message sent through this port, in order (tests). */
	readonly sent: PushMessage[];
	/** Queues what the next sends answer, in order; past the queue every send answers `sent`. */
	willDeliver(...results: PushDelivery[]): void;
};

export function createMemoryPush(
	options: {
		readonly webPublicKey?: string | null;
		readonly devicesConfigured?: boolean;
	} = {}
): MemoryPush {
	const sent: PushMessage[] = [];
	const queued: PushDelivery[] = [];
	return {
		sent,
		webPublicKey: () => options.webPublicKey ?? null,
		devicesConfigured: () => options.devicesConfigured ?? true,
		send: async (message) => {
			sent.push(message);
			return queued.shift() ?? 'sent';
		},
		willDeliver: (...results) => {
			queued.push(...results);
		}
	};
}
