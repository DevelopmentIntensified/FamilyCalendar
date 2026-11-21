/**
 * alerts http: the nine `/api` methods and the `/calendar/notifications` page
 * load, over the services.
 *
 * Reproduces the legacy wire exactly: auth mode, statuses, bodies and error
 * copy. No SQL and no rules — the services and the rules own both. Every route
 * below is wiring-only (`export const POST = …handler`).
 *
 * `bodyMode: 'lenient'` on the four routes whose legacy parser was
 * `request.json().catch(() => null)`: a malformed or empty body reached the
 * guard as `null`, and the frozen goldens pin that route's own sentence
 * (`Invalid request body`, `token is required`, `Invalid subscription
 * payload`). The preference PUT keeps the default mode: its legacy parser was
 * `readJsonObject`, which answers `Invalid JSON` for a non-object body, and the
 * contract already does.
 *
 * Doc: ./README.md#public-interface
 */
import { endpoint, ok, reply } from '$lib/kernel/http/endpoint.server';
import { pageLoad } from '$lib/kernel/http/pageHandlers.server';
import {
	AlertPreferenceBody,
	AlertPreferenceParams,
	AlertsMarkBody,
	DeviceRegistrationBody,
	PushSubscriptionBody,
	PushUnsubscribeBody,
	type AlertPreferencesResponse,
	type AlertPreferenceSavedResponse,
	type AlertListResponse,
	type AlertsAckResponse,
	type AlertsPrunedResponse,
	type PushPublicKeyResponse
} from './alerts.contract';
import {
	listAlertFeed,
	markAlertAsRead,
	markAllAlertsAsRead,
	pruneReadAlerts
} from './alerts.feed.service.server';
import { ALERT_PREFERENCES } from './alerts.preferences.rules';
import { getAlertPreferences, setAlertPreference } from './alerts.preferences.service.server';
import {
	getPushPublicKey,
	registerDevice,
	removePushSubscription,
	savePushSubscription,
	unregisterDevice
} from './alerts.push.service.server';
import { unrecognisedAlertTypes } from './alerts.vocabulary.rules';

/** `GET /api/notifications`: the newest 50 rows (guarded) and the whole unread count. */
export const listAlertsEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => {
		const response: AlertListResponse = await listAlertFeed(ctx, actor);
		return ok(response);
	}
});

/**
 * `POST /api/notifications`: one action, tried `all` → `pruneRead` → `id`. The
 * lenient body is what makes a string, `null`, malformed JSON and an empty body
 * reach the contract as `null`, which answers the legacy `Invalid request body`.
 */
export const markAlertsEndpoint = endpoint({
	auth: 'user',
	body: AlertsMarkBody,
	bodyMode: 'lenient',
	handle: async ({ ctx, actor, body }) => {
		if ('all' in body) {
			await markAllAlertsAsRead(ctx, actor);
			const response: AlertsAckResponse = { success: true };
			return ok(response);
		}
		if ('pruneRead' in body) {
			const removed = await pruneReadAlerts(ctx, actor);
			const response: AlertsPrunedResponse = { success: true, removed };
			return ok(response);
		}
		await markAlertAsRead(ctx, actor, body.id);
		const response: AlertsAckResponse = { success: true };
		return ok(response);
	}
});

/** `POST /api/devices`: register (or re-own) the caller's FCM token. */
export const registerDeviceEndpoint = endpoint({
	auth: 'user',
	body: DeviceRegistrationBody,
	bodyMode: 'lenient',
	handle: async ({ ctx, actor, body }) => {
		await registerDevice(ctx, actor, { token: body.token, platform: body.platform });
		const response: AlertsAckResponse = { success: true };
		return ok(response);
	}
});

/**
 * `DELETE /api/devices`: the shared parser validates the platform even though
 * DELETE ignores it (an installed client sends `android`; pinned by golden).
 */
export const unregisterDeviceEndpoint = endpoint({
	auth: 'user',
	body: DeviceRegistrationBody,
	bodyMode: 'lenient',
	handle: async ({ ctx, actor, body }) => {
		await unregisterDevice(ctx, actor, body.token);
		const response: AlertsAckResponse = { success: true };
		return ok(response);
	}
});

/** `GET /api/push/public-key`: public; the raw key, or `null` when VAPID is unset. */
export const pushPublicKeyEndpoint = endpoint({
	auth: 'public',
	handle: async ({ ctx }) => {
		const response: PushPublicKeyResponse = getPushPublicKey(ctx);
		return ok(response);
	}
});

/** `POST /api/push/subscribe`: upsert one browser subscription by endpoint. */
export const subscribePushEndpoint = endpoint({
	auth: 'user',
	body: PushSubscriptionBody,
	bodyMode: 'lenient',
	handle: async ({ ctx, actor, body }) => {
		await savePushSubscription(ctx, actor, body);
		const response: AlertsAckResponse = { success: true };
		return ok(response);
	}
});

/** `POST /api/push/unsubscribe`: delete only the caller's row for the endpoint. */
export const unsubscribePushEndpoint = endpoint({
	auth: 'user',
	body: PushUnsubscribeBody,
	bodyMode: 'lenient',
	handle: async ({ ctx, actor, body }) => {
		await removePushSubscription(ctx, actor, body.endpoint);
		const response: AlertsAckResponse = { success: true };
		return ok(response);
	}
});

/** `GET /api/me/notification-preferences`: the four switches plus their labels. */
export const listAlertPreferencesEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => {
		const response: AlertPreferencesResponse = {
			preferences: await getAlertPreferences(ctx, actor),
			options: [...ALERT_PREFERENCES]
		};
		return ok(response);
	}
});

/**
 * `PUT /api/me/notification-preferences/[id]`: one switch, one receipt. The
 * path decides which row is written (`AlertPreferenceParams`), and a write that
 * fails answers the legacy `500 {error: "<Label> alerts are on|off. This did not
 * save."}`.
 */
export const setAlertPreferenceEndpoint = endpoint({
	auth: 'user',
	params: AlertPreferenceParams,
	body: AlertPreferenceBody,
	handle: async ({ ctx, actor, params, body }) => {
		const saved = await setAlertPreference(ctx, actor, {
			id: params.id,
			value: body.value
		});
		if (!saved.ok) return reply(500, { error: saved.message });
		const response: AlertPreferenceSavedResponse = { success: true, message: saved.message };
		return ok(response);
	}
});

/**
 * `/calendar/notifications` load: signed in only (302 to `/login`), the same
 * 50-row window the bell reads, and the distinct unrecognised types logged
 * server-side so a bad write is visible.
 */
export const alertsPageLoad = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor }) => {
		const feed = await listAlertFeed(ctx, actor);
		const unknown = unrecognisedAlertTypes(feed.notifications);
		if (unknown.length) {
			ctx.log.warn('unrecognised_alert_types', { types: unknown.join(', ') });
		}
		return feed;
	}
});
