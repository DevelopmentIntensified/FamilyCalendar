/**
 * alerts — public isomorphic interface: the wire contracts, the Alert
 * vocabulary and feed rules, the preference rules, the browser api client, the
 * push client and the three state classes.
 * Other modules import alerts ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export type {
	AlertFilter,
	AlertGroup,
	AlertInput,
	AlertListResponse,
	AlertNotificationMethods,
	AlertPreferenceBody,
	AlertPreferenceId,
	AlertPreferenceOption,
	AlertPreferenceParams,
	AlertPreferenceSavedResponse,
	AlertPreferences,
	AlertPreferencesResponse,
	AlertRow,
	AlertType,
	AlertsAckResponse,
	AlertsMarkBody,
	AlertsPrunedResponse,
	DevicePlatform,
	DeviceRegistrationBody,
	PushPublicKeyResponse,
	PushSubscriptionBody,
	PushUnsubscribeBody,
	StoredAlertRow
} from './alerts.contract';

export { createAlertsApi, type AlertsApi } from './alerts.api';

export {
	ALERT_TYPES,
	alertGlyph,
	alertGroup,
	alertLabel,
	alertTone,
	isAlertType,
	toAlertRow,
	unrecognisedAlertTypes
} from './alerts.vocabulary.rules';

export {
	ALERT_FILTERS,
	ALERT_PAGE_SIZE,
	alertCounts,
	filterAlerts,
	groupAlerts,
	isPlainAlertClick
} from './alerts.feed.rules';
export type { AlertClickEvent, AlertCounts, AlertGroups } from './alerts.feed.rules';

export {
	ALERT_PREFERENCE_IDS,
	ALERT_PREFERENCES,
	DEFAULT_ALERT_PREFERENCES,
	preferenceChangeLabel,
	preferencesFrom,
	saveOutcome,
	withPreference
} from './alerts.preferences.rules';
export type { AlertSaveOutcome } from './alerts.preferences.rules';

export {
	browserPushEnvironment,
	getPushState,
	pushFailureText,
	subscribeToPush,
	unsubscribeFromPush
} from './alerts.push.api';
export type {
	AlertsPushApi,
	BrowserPushSubscription,
	PushEnvironment,
	PushFailureReason,
	PushRegistration,
	PushState,
	PushSubscribeResult
} from './alerts.push.api';

export { AlertsState, browserAlertZone } from './alerts.state.svelte.js';
export type { AlertsStateDeps } from './alerts.state.svelte.js';
export { AlertPreferencesState } from './alerts.preferences.state.svelte.js';
export type { AlertPreferencesApi } from './alerts.preferences.state.svelte.js';
export { AlertsBellState } from './alerts.bell.state.svelte.js';
export type { AlertsBellApi, AlertsBellDeps, AlertPushFeedback } from './alerts.bell.state.svelte.js';
