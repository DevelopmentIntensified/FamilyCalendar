/**
 * alerts push services: device tokens, Web Push subscriptions and the two
 * fan-outs — a visible Alert push and the silent `events_changed` nudge.
 *
 * The transports are the kernel `Push` port (`ctx.push`): one `send` per web
 * subscription or device token, and the `dead` answer is the only one that
 * deletes the target (legacy: a Web Push 404/410, an FCM `unregistered`
 * token). Who gets a message is this file's job; the message wordings are
 * `alerts.push.rules.ts`'.
 *
 * Configuration is legacy `isVapidConfigured()` / `isFcmConfigured()`, read
 * from `ctx.config` / `ctx.push` so an unconfigured deployment does no row
 * read and no send. The legacy `sendPushToUser` ran the web and device legs in
 * parallel through `allSettled`: one failing channel never blocks the other and
 * the call never rejects.
 *
 * `nudgeEventsChanged` used to resolve its audience here (`realCalendarAudience`
 * read `calendars` and `familyMembers`). Those tables belong to `calendar` and
 * `family` (R1), so the caller resolves the audience and passes the user ids;
 * this module only transports. The actor is always included, as legacy did
 * (#281).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type {
	DevicePlatform,
	PushPublicKeyResponse,
	PushSubscriptionBody
} from './alerts.contract';
import {
	distinctTokens,
	distinctUserIds,
	eventsChangedMessage,
	visibleMessage,
	type PushPayload
} from './alerts.push.rules';
import {
	deleteDeadDeviceToken,
	deletePushSubscription,
	listDeviceTokens,
	listPushSubscriptions,
	upsertDeviceToken,
	upsertPushSubscription
} from './alerts.repo.server';

/** What `GET /api/push/public-key` answers, from the port the browser flow reads. */
export function getPushPublicKey(ctx: Ctx): PushPublicKeyResponse {
	return { publicKey: ctx.push.webPublicKey() };
}

/** Register (or re-own) the caller's FCM token, stamped `now`. */
export async function registerDevice(
	ctx: Ctx,
	actor: Actor,
	input: { readonly token: string; readonly platform: DevicePlatform }
): Promise<void> {
	await upsertDeviceToken(ctx.db, actor.id, input.token, input.platform, ctx.clock.now());
}

/** Delete only the caller's row for the token; absent is a no-op. */
export async function unregisterDevice(
	ctx: Ctx,
	actor: Actor,
	token: string
): Promise<void> {
	await deleteDeviceToken(ctx.db, actor.id, token);
}

/** Save a browser subscription, deduplicated on the endpoint (a known one is re-owned). */
export async function savePushSubscription(
	ctx: Ctx,
	actor: Actor,
	body: PushSubscriptionBody
): Promise<void> {
	await upsertPushSubscription(ctx.db, actor.id, body, ctx.clock.now());
}

/** Delete only the caller's subscription for the endpoint; absent is a no-op. */
export async function removePushSubscription(
	ctx: Ctx,
	actor: Actor,
	endpoint: string
): Promise<void> {
	await deletePushSubscription(ctx.db, actor.id, endpoint);
}

/**
 * The visible push for one stored Alert: title = actor, body = message, tap
 * target = the Alert's link or `/calendar/tasks`. Both channels run in
 * parallel; this never rejects, so `createAlert` can fire it without awaiting.
 */
export async function sendAlertPush(
	ctx: Ctx,
	userId: string,
	payload: PushPayload
): Promise<void> {
	const results = await Promise.allSettled([
		sendWebPush(ctx, userId, payload),
		sendDevicePush(ctx, userId, payload)
	]);
	for (const result of results) {
		if (result.status === 'rejected') {
			ctx.log.error('alert_push_channel_failed', { message: messageOf(result.reason) });
		}
	}
}

/**
 * Silent sync nudge to every device of `input.userIds` plus the actor: one
 * data-only message per token, tokens deduplicated across users. Unconfigured
 * FCM does no work at all (legacy `isFcmConfigured()` gate). Never rejects.
 */
export async function nudgeEventsChanged(
	ctx: Ctx,
	actor: Actor,
	input: { readonly userIds: readonly string[] }
): Promise<void> {
	// Unconfigured (dev, tests, preview without Firebase): no db work at all.
	if (!ctx.push.devicesConfigured()) return;
	const audience = distinctUserIds([actor.id, ...input.userIds]);
	try {
		const tokens = distinctTokens(await listDeviceTokens(ctx.db, audience));
		const body = eventsChangedMessage(actor.id);
		await Promise.all(
			tokens.map(async (token) => {
				const delivery = await ctx.push.send({ channel: 'device', token, body });
				if (delivery === 'dead') await pruneDeviceToken(ctx, token);
			})
		);
	} catch (error) {
		ctx.log.error('events_changed_nudge_failed', { message: messageOf(error) });
	}
}

/** Web leg of `sendAlertPush`; skips silently unless both VAPID halves are set (legacy gate). */
async function sendWebPush(ctx: Ctx, userId: string, payload: PushPayload): Promise<void> {
	if (!ctx.config.vapidPublicKey || !ctx.config.vapidPrivateKey) return;
	const subscriptions = await listPushSubscriptions(ctx.db, userId);
	await Promise.all(
		subscriptions.map(async (subscription) => {
			const delivery = await ctx.push.send({
				channel: 'web',
				subscription: {
					endpoint: subscription.endpoint,
					p256dh: subscription.p256dh,
					auth: subscription.auth
				},
				notice: payload
			});
			if (delivery === 'dead') {
				await deletePushSubscription(ctx.db, userId, subscription.endpoint);
			}
		})
	);
}

/** Device leg of `sendAlertPush`; skips silently when FCM is unconfigured. */
async function sendDevicePush(ctx: Ctx, userId: string, payload: PushPayload): Promise<void> {
	if (!ctx.push.devicesConfigured()) return;
	const tokens = distinctTokens(await listDeviceTokens(ctx.db, [userId]));
	const body = visibleMessage(payload);
	await Promise.all(
		tokens.map(async (token) => {
			const delivery = await ctx.push.send({ channel: 'device', token, body });
			if (delivery === 'dead') await pruneDeviceToken(ctx, token);
		})
	);
}

/** Deleting a dead token is best-effort: a failure is logged, never rethrown. */
async function pruneDeviceToken(ctx: Ctx, token: string): Promise<void> {
	try {
		await deleteDeadDeviceToken(ctx.db, token);
	} catch (error) {
		ctx.log.error('device_token_prune_failed', { message: messageOf(error) });
	}
}

function messageOf(error: unknown): string {
	// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary: what a rejected promise or thrown value carries.
	return error instanceof Error ? error.message : String(error);
}
