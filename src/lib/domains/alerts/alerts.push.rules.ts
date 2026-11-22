/**
 * alerts push rules: the pure half of push fan-out. What a push says (the
 * visible Alert push and the silent `events_changed` nudge), who gets it (users
 * and tokens, deduplicated) and when a dead target is pruned. Sending, the
 * channels and the database are the service's; nothing here reads the clock,
 * the environment or the network.
 *
 * `FcmMessage` is the body this module builds for the FCM v1 `message` minus
 * `token` (there is no multicast: one send per token). The transport that
 * signs and posts it belongs to the kernel push port.
 *
 * Doc: ./README.md#invariants
 */
import type { AlertType } from './alerts.contract';

/** Where a task Alert push opens when the Alert carries no link (Q-021). */
export const ALERT_PUSH_DEFAULT_LINK = '/calendar/tasks';

/**
 * Where a push opens when its Alert carries no link, by type (Q-021): "X added
 * you to the family" opens the family page, every task Alert the task page.
 * Declared once for the whole closed type set, so a sixth type cannot miss a row.
 */
const ALERT_PUSH_LINK: Record<AlertType, string> = {
	added_to_family: '/family',
	assignment_pending: ALERT_PUSH_DEFAULT_LINK,
	assignment_accepted: ALERT_PUSH_DEFAULT_LINK,
	assignment_declined: ALERT_PUSH_DEFAULT_LINK,
	task_completed: ALERT_PUSH_DEFAULT_LINK
};

/** The tap target a push of `type` takes when the Alert has no link of its own. */
export function alertPushLink(type: AlertType): string {
	return ALERT_PUSH_LINK[type];
}

/** What a visible push says: the tray title and body, and the tap target. */
export type PushPayload = {
	readonly title: string;
	readonly body: string;
	readonly link?: string;
};

/** The `message` body minus `token`. FCM requires every `data` value to be a string. */
export type FcmMessage = {
	readonly notification?: { readonly title: string; readonly body: string };
	readonly data?: Readonly<Record<string, string>>;
	readonly android?: {
		readonly priority?: 'high' | 'normal';
		readonly collapse_key?: string;
		readonly ttl?: string;
	};
};

/** What FCM said about one send. Only `unregistered` makes the token dead. */
export type FcmSendResult = 'sent' | 'unregistered' | 'failed';

/**
 * The push for one new Alert: the title is the actor, the body is the message
 * and the tap target is the Alert's link, or the page its type opens when it
 * has none (Q-021: the family page for `added_to_family`, the task page for the
 * rest). An empty-string link is a link, so it is kept here and left out of the
 * FCM data by `visibleMessage`.
 */
export function alertPushPayload(alert: {
	readonly type: AlertType;
	readonly actorName: string;
	readonly message: string;
	readonly link?: string | null;
}): PushPayload {
	return {
		title: alert.actorName,
		body: alert.message,
		link: alert.link ?? alertPushLink(alert.type)
	};
}

/**
 * A user-visible notification: shown by the system tray at high priority;
 * `data.link` is the tap target and is present only for a non-empty link.
 */
export function visibleMessage(payload: PushPayload): FcmMessage {
	const data: Record<string, string> = { type: 'notification' };
	if (payload.link) data.link = payload.link;
	return {
		notification: { title: payload.title, body: payload.body },
		data,
		android: { priority: 'high' }
	};
}

/**
 * The silent sync nudge: data-only (no notification block, so nothing shows),
 * high priority so a dozing phone wakes to reschedule reminders, collapsed so a
 * burst of edits delivers once, short TTL because a stale nudge is worthless.
 * `actorId` (#281) lets the editor's own phone refresh silently instead of
 * announcing "Event updates".
 */
export function eventsChangedMessage(actorId: string): FcmMessage {
	return {
		data: { type: 'events_changed', actorId },
		android: { priority: 'high', collapse_key: 'events_changed', ttl: '600s' }
	};
}

/** The audience of one fan-out, each user once, first occurrence first. */
export function distinctUserIds(userIds: readonly string[]): string[] {
	return [...new Set(userIds)];
}

/** The tokens to send to, each once: two users can never double-send to one device. */
export function distinctTokens(rows: readonly { readonly token: string }[]): string[] {
	return [...new Set(rows.map((row) => row.token))];
}

/** A token FCM reports unregistered is dead and deleted; a `failed` send keeps it. */
export function shouldPruneDeviceToken(result: FcmSendResult): boolean {
	return result === 'unregistered';
}

/**
 * A Web Push error that means the browser's subscription no longer exists
 * (404 Not Found or 410 Gone) and should be deleted. Any other failure, or a
 * thrown value without a `statusCode`, is logged and keeps the subscription.
 *
 * A plain field test, not a schema: this is the only parse in the file, and a
 * schema library here would ship its chunk to the chrome that renders the
 * push section (ADR 0010).
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary: the web-push library throws untyped values.
export function isSubscriptionGone(error: unknown): boolean {
	if (typeof error !== 'object' || error === null || Array.isArray(error)) return false;
	if (!('statusCode' in error)) return false;
	const { statusCode } = error as { statusCode: unknown };
	return statusCode === 404 || statusCode === 410;
}
