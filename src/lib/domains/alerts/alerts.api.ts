/**
 * alerts api: the browser client for this module's endpoints, on the kernel
 * api client (K-07). Returns `ApiResult`, so a state class rolls back and
 * toasts instead of catching.
 *
 * Three callers exist: the Alerts page (`list`/`mark`/`markAll`/`prune`), the
 * bell (same four plus the push calls) and the account card's four switches
 * (`getPreferences`/`setPreference`, composed by the account screen at its
 * port). All three go through the public entries, which is why this file
 * exports the factory and its type — never a raw `fetch`.
 *
 * `DELETE /api/devices` sends a JSON body, which `fetch` allows (the golden
 * pins the shared parser reading it).
 *
 * Doc: ./README.md#public-interface
 */
import { createApiClient, type ApiResult } from '$lib/kernel/client/apiClient';
import type {
	AlertListResponse,
	AlertPreferenceId,
	AlertPreferencesResponse,
	AlertPreferenceSavedResponse,
	AlertsAckResponse,
	AlertsMarkBody,
	AlertsPrunedResponse,
	DeviceRegistrationBody,
	PushPublicKeyResponse,
	PushSubscriptionBody,
	PushUnsubscribeBody
} from './alerts.contract';

/** Every call this module's browser surfaces make, one method per endpoint. */
export interface AlertsApi {
	list(): Promise<ApiResult<AlertListResponse>>;
	mark(id: string): Promise<ApiResult<AlertsAckResponse>>;
	markAll(): Promise<ApiResult<AlertsAckResponse>>;
	prune(): Promise<ApiResult<AlertsPrunedResponse>>;
	registerDevice(body: DeviceRegistrationBody): Promise<ApiResult<AlertsAckResponse>>;
	unregisterDevice(body: DeviceRegistrationBody): Promise<ApiResult<AlertsAckResponse>>;
	publicKey(): Promise<ApiResult<PushPublicKeyResponse>>;
	subscribePush(body: PushSubscriptionBody): Promise<ApiResult<AlertsAckResponse>>;
	unsubscribePush(body: PushUnsubscribeBody): Promise<ApiResult<AlertsAckResponse>>;
	getPreferences(): Promise<ApiResult<AlertPreferencesResponse>>;
	setPreference(
		id: AlertPreferenceId,
		value: boolean
	): Promise<ApiResult<AlertPreferenceSavedResponse>>;
}

export function createAlertsApi(client = createApiClient()): AlertsApi {
	return {
		/** `GET /api/notifications`: the newest 50 rows and the whole unread count. */
		list(): Promise<ApiResult<AlertListResponse>> {
			return client.request('GET', '/api/notifications');
		},
		/** `POST /api/notifications` with `{id}`: mark one row read. */
		mark(id: string): Promise<ApiResult<AlertsAckResponse>> {
			const body: AlertsMarkBody = { id };
			return client.request('POST', '/api/notifications', body);
		},
		/** `POST /api/notifications` with `{all:true}`: mark every unread row read. */
		markAll(): Promise<ApiResult<AlertsAckResponse>> {
			const body: AlertsMarkBody = { all: true };
			return client.request('POST', '/api/notifications', body);
		},
		/** `POST /api/notifications` with `{pruneRead:true}`: delete the read rows. */
		prune(): Promise<ApiResult<AlertsPrunedResponse>> {
			const body: AlertsMarkBody = { pruneRead: true };
			return client.request('POST', '/api/notifications', body);
		},
		/** `POST /api/devices`: register (or re-own) an FCM token. */
		registerDevice(body: DeviceRegistrationBody): Promise<ApiResult<AlertsAckResponse>> {
			return client.request('POST', '/api/devices', body);
		},
		/** `DELETE /api/devices`: drop the caller's row for the token. */
		unregisterDevice(body: DeviceRegistrationBody): Promise<ApiResult<AlertsAckResponse>> {
			return client.request('DELETE', '/api/devices', body);
		},
		/** `GET /api/push/public-key`: the VAPID key, or `null` when unset. */
		publicKey(): Promise<ApiResult<PushPublicKeyResponse>> {
			return client.request('GET', '/api/push/public-key');
		},
		/** `POST /api/push/subscribe`: upsert one browser subscription by endpoint. */
		subscribePush(body: PushSubscriptionBody): Promise<ApiResult<AlertsAckResponse>> {
			return client.request('POST', '/api/push/subscribe', body);
		},
		/** `POST /api/push/unsubscribe`: drop the caller's row for the endpoint. */
		unsubscribePush(body: PushUnsubscribeBody): Promise<ApiResult<AlertsAckResponse>> {
			return client.request('POST', '/api/push/unsubscribe', body);
		},
		/** `GET /api/me/notification-preferences`: the four switches plus their copy. */
		getPreferences(): Promise<ApiResult<AlertPreferencesResponse>> {
			return client.request('GET', '/api/me/notification-preferences');
		},
		/** `PUT /api/me/notification-preferences/[id]`: save one switch, get its receipt. */
		setPreference(
			id: AlertPreferenceId,
			value: boolean
		): Promise<ApiResult<AlertPreferenceSavedResponse>> {
			return client.request('PUT', `/api/me/notification-preferences/${id}`, { value });
		}
	};
}
