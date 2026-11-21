/**
 * alerts — public server interface: the Alert/preference/device/push
 * use-cases and this module's `endpoint()` handlers.
 * Doc: ./README.md#public-interface
 */
export {
	createAlert,
	listAlertFeed,
	markAlertAsRead,
	markAllAlertsAsRead,
	pruneReadAlerts,
	pruneReadAlertsOlderThan
} from './alerts.feed.service.server';
export {
	getAlertPreferences,
	setAlertPreference
} from './alerts.preferences.service.server';
export type { AlertPreferenceSave } from './alerts.preferences.service.server';
export {
	getPushPublicKey,
	nudgeEventsChanged,
	registerDevice,
	removePushSubscription,
	savePushSubscription,
	unregisterDevice
} from './alerts.push.service.server';
export {
	alertsPageLoad,
	listAlertPreferencesEndpoint,
	listAlertsEndpoint,
	markAlertsEndpoint,
	pushPublicKeyEndpoint,
	registerDeviceEndpoint,
	setAlertPreferenceEndpoint,
	subscribePushEndpoint,
	unregisterDeviceEndpoint,
	unsubscribePushEndpoint
} from './alerts.http.server';
