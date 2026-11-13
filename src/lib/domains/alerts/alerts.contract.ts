/**
 * alerts contract: the zod schemas and types for every `/api` body and
 * response this module owns. Server-side shapes the repo and the rules pass
 * around (`StoredAlertRow`, `AlertInput`, `AlertNotificationMethods`) live at
 * the bottom.
 *
 * The error copy is the wire: the golden tests pin it
 * (`alerts.http.db.test.ts`). Keep the legacy wording, including the three
 * different "bad body" sentences the three body shapes answer with.
 *
 * The closed vocabularies (Alert types and groups, the filter chips, the four
 * preference ids) live in their `*.rules.ts` files; this file derives their
 * types and parses with them, so each set has one home.
 *
 * Timestamps: `notifications.readAt` / `createdAt` are `timestamptz` columns
 * declared `mode: 'string'`, so the wire carries the driver's Postgres text
 * render (`2026-03-04 10:00:00+00`, no `T`), not ISO. `wireInstant` accepts
 * both spellings and the golden pins the render; normalising it to ISO is a
 * wire change and an owner question.
 *
 * Doc: ./README.md#invariants
 */
import { oneOf, wholeNumber, z } from '$lib/kernel/validation/validators';
import { ALERT_FILTERS } from './alerts.feed.rules';
import { ALERT_PREFERENCE_IDS } from './alerts.preferences.rules';
import { ALERT_GROUPS, ALERT_TYPES } from './alerts.vocabulary.rules';

// --- Vocabularies -----------------------------------------------------------

/** One of the five types the app writes (the column itself is free text). */
export type AlertType = (typeof ALERT_TYPES)[number];

/** The two feed sections: needs you (a decision is asked) or news. */
export type AlertGroup = (typeof ALERT_GROUPS)[number];

/** The three filter chips of the Alerts page. */
export type AlertFilter = (typeof ALERT_FILTERS)[number];

/** One of the four notification preference switches. */
export type AlertPreferenceId = (typeof ALERT_PREFERENCE_IDS)[number];

/** The only platform a device token can register for today. */
export const DEVICE_PLATFORMS = ['android'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/** Device tokens longer than this are refused (after trimming). */
export const MAX_DEVICE_TOKEN_LENGTH = 4096;

// --- Wire copy --------------------------------------------------------------

/** `POST /api/notifications` and `POST /api/push/unsubscribe`: not a usable body. */
export const INVALID_REQUEST_BODY_MESSAGE = 'Invalid request body';

/** `POST /api/notifications`: an object body with no usable action. */
export const ALERT_ID_REQUIRED_MESSAGE = 'Notification id is required';

/** `/api/devices`: a missing, blank or non-string token, or a non-object body. */
export const TOKEN_REQUIRED_MESSAGE = 'token is required';

/** `/api/devices`: a token over `MAX_DEVICE_TOKEN_LENGTH` characters. */
export const TOKEN_TOO_LONG_MESSAGE = 'token is too long';

/** `/api/devices`: any platform but `android`, DELETE included. */
export const PLATFORM_INVALID_MESSAGE = "platform must be 'android'";

/** `POST /api/push/subscribe`: any malformed subscription. */
export const PUSH_SUBSCRIPTION_INVALID_MESSAGE = 'Invalid subscription payload';

/** `PUT /api/me/notification-preferences/[id]`: an id outside the four. */
export const UNKNOWN_PREFERENCE_MESSAGE = 'Unknown notification preference';

/** `PUT /api/me/notification-preferences/[id]`: `value` is not a boolean. */
export const PREFERENCE_VALUE_REQUIRED_MESSAGE = 'Notification preference value is required';

/** `PUT /api/me/notification-preferences/[id]`: the body is not a JSON object. */
export const INVALID_JSON_MESSAGE = 'Invalid JSON';

// --- Wire pieces ------------------------------------------------------------

/**
 * A timestamp as the wire carries it: ISO (`2026-03-04T10:00:00.000Z`) or the
 * Postgres text render (`2026-03-04 10:00:00+00`) a `mode: 'string'` column
 * hands the driver. Shape only; nothing parses it into a `Date` here.
 */
const WIRE_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/;

function wireInstant() {
	return z.string().regex(WIRE_INSTANT, { error: 'Invalid date' });
}

function nonEmptyText(message: string) {
	return z.string({ error: message }).min(1, { error: message });
}

// --- `/api/notifications` ---------------------------------------------------

/**
 * One Alert as the feed carries it. `type` is the guarded type, or `null` for
 * a value the column held that is not one of the five; `rawType` is exactly
 * what the column said, and `group` is derived from it, so no surface can
 * group a row differently.
 */
export const AlertRow = z.object({
	id: z.string(),
	type: oneOf(ALERT_TYPES, 'Unknown alert type').nullable(),
	rawType: z.string(),
	group: oneOf(ALERT_GROUPS, 'Unknown alert group'),
	actorName: z.string(),
	message: z.string(),
	link: z.string().nullable(),
	readAt: wireInstant().nullable(),
	createdAt: wireInstant()
});
export type AlertRow = z.infer<typeof AlertRow>;

/** `GET /api/notifications`: the newest window and the caller's whole unread count. */
export const AlertListResponse = z.object({
	notifications: z.array(AlertRow),
	unreadCount: wholeNumber('Invalid unread count')
});
export type AlertListResponse = z.infer<typeof AlertListResponse>;

/** What `POST /api/notifications` calls an object with no action in it, `[]` included. */
const JSON_CONTAINER = z.union([z.array(z.unknown()), z.looseObject({})]);

/**
 * `POST /api/notifications`. One action per call, tried in this order: `all`
 * (mark every unread row read), `pruneRead` (delete the read rows), `id` (mark
 * one row read). An action key only counts with its exact value (`all: true`,
 * `pruneRead: true`, a non-empty string `id`); a wrong-typed key falls through
 * to the next. A string, `null` or number body is `Invalid request body`; any
 * other body, an array included, that names no action is `Notification id is
 * required`. The inferred type is the body a client sends.
 */
export const AlertsMarkBody = z.union(
	[
		z.object({ all: z.literal(true) }),
		z.object({ pruneRead: z.literal(true) }),
		z.object({ id: nonEmptyText(ALERT_ID_REQUIRED_MESSAGE) })
	],
	{
		error: (issue) =>
			JSON_CONTAINER.safeParse(issue.input).success
				? ALERT_ID_REQUIRED_MESSAGE
				: INVALID_REQUEST_BODY_MESSAGE
	}
);
export type AlertsMarkBody = z.infer<typeof AlertsMarkBody>;

/** `200 {success:true}`: every write that has nothing else to say. */
export const AlertsAckResponse = z.object({ success: z.literal(true) });
export type AlertsAckResponse = z.infer<typeof AlertsAckResponse>;

/** `POST /api/notifications` with `{pruneRead:true}`: how many read rows went. */
export const AlertsPrunedResponse = z.object({
	success: z.literal(true),
	removed: wholeNumber('Invalid removed count')
});
export type AlertsPrunedResponse = z.infer<typeof AlertsPrunedResponse>;

// --- `/api/devices` ---------------------------------------------------------

/**
 * `POST` and `DELETE /api/devices` share one parser (DELETE ignores the
 * platform but still validates it). The token is trimmed before the emptiness
 * and length checks; an absent platform is `android`, a present one must be
 * exactly `android` (`null` is refused). The first failure wins, token first.
 */
export const DeviceRegistrationBody = z.object(
	{
		token: z
			.string({ error: TOKEN_REQUIRED_MESSAGE })
			.trim()
			.min(1, { error: TOKEN_REQUIRED_MESSAGE })
			.max(MAX_DEVICE_TOKEN_LENGTH, { error: TOKEN_TOO_LONG_MESSAGE }),
		platform: oneOf(DEVICE_PLATFORMS, PLATFORM_INVALID_MESSAGE).default('android')
	},
	{ error: TOKEN_REQUIRED_MESSAGE }
);
export type DeviceRegistrationBody = z.infer<typeof DeviceRegistrationBody>;

// --- `/api/push/*` ----------------------------------------------------------

/** `POST /api/push/subscribe`: the endpoint and both keys, all non-empty strings (not trimmed). */
export const PushSubscriptionBody = z.object(
	{
		endpoint: nonEmptyText(PUSH_SUBSCRIPTION_INVALID_MESSAGE),
		keys: z.object(
			{
				p256dh: nonEmptyText(PUSH_SUBSCRIPTION_INVALID_MESSAGE),
				auth: nonEmptyText(PUSH_SUBSCRIPTION_INVALID_MESSAGE)
			},
			{ error: PUSH_SUBSCRIPTION_INVALID_MESSAGE }
		)
	},
	{ error: PUSH_SUBSCRIPTION_INVALID_MESSAGE }
);
export type PushSubscriptionBody = z.infer<typeof PushSubscriptionBody>;

/** `POST /api/push/unsubscribe`: the endpoint to drop, a non-empty string. */
export const PushUnsubscribeBody = z.object(
	{ endpoint: nonEmptyText(INVALID_REQUEST_BODY_MESSAGE) },
	{ error: INVALID_REQUEST_BODY_MESSAGE }
);
export type PushUnsubscribeBody = z.infer<typeof PushUnsubscribeBody>;

/** `GET /api/push/public-key`: the raw configured key, or `null` when it is unset. */
export const PushPublicKeyResponse = z.object({ publicKey: z.string().nullable() });
export type PushPublicKeyResponse = z.infer<typeof PushPublicKeyResponse>;

// --- `/api/me/notification-preferences` -------------------------------------

/** The four switches by id; the shape the card reads and a save writes. */
export const AlertPreferences = z.object({
	taskAssigned: z.boolean(),
	taskCompleted: z.boolean(),
	familyJoined: z.boolean(),
	aiSuggestions: z.boolean()
});
export type AlertPreferences = z.infer<typeof AlertPreferences>;

/** One switch as the account card lists it. */
export const AlertPreferenceOption = z.object({
	id: oneOf(ALERT_PREFERENCE_IDS, UNKNOWN_PREFERENCE_MESSAGE),
	label: z.string(),
	/** The channels this switch covers, in the approved page's wording. */
	hint: z.string(),
	/** What an account that has never opened the card shows. */
	default: z.boolean()
});
export type AlertPreferenceOption = z.infer<typeof AlertPreferenceOption>;

/** `GET /api/me/notification-preferences`: the four switches plus their labels. */
export const AlertPreferencesResponse = z.object({
	preferences: AlertPreferences,
	options: z.array(AlertPreferenceOption)
});
export type AlertPreferencesResponse = z.infer<typeof AlertPreferencesResponse>;

/** The `id` route parameter of the save; the path decides which row is written. */
export const AlertPreferenceParams = z.object({
	id: oneOf(ALERT_PREFERENCE_IDS, UNKNOWN_PREFERENCE_MESSAGE)
});
export type AlertPreferenceParams = z.infer<typeof AlertPreferenceParams>;

/**
 * `PUT /api/me/notification-preferences/[id]`. A body that is not a JSON
 * object (an array, a string, `null`) is `Invalid JSON`; an object whose
 * `value` is not a real boolean is `Notification preference value is required`.
 */
export const AlertPreferenceBody = z.object(
	{ value: z.boolean({ error: PREFERENCE_VALUE_REQUIRED_MESSAGE }) },
	{ error: INVALID_JSON_MESSAGE }
);
export type AlertPreferenceBody = z.infer<typeof AlertPreferenceBody>;

/** `200 {success, message}`: the receipt the card shows, e.g. `Task completed alerts are off. Saved.` */
export const AlertPreferenceSavedResponse = z.object({
	success: z.literal(true),
	message: z.string()
});
export type AlertPreferenceSavedResponse = z.infer<typeof AlertPreferenceSavedResponse>;

// --- Server-side shapes -----------------------------------------------------

/**
 * A stored `notifications` row as the rules decode it: `type` is the free-text
 * column. `link` and `readAt` are optional so a hand-built row that leaves
 * them out reads the same as a null one.
 */
export type StoredAlertRow = {
	readonly id: string;
	readonly type: string;
	readonly actorName: string;
	readonly message: string;
	readonly link?: string | null;
	readonly readAt?: string | null;
	readonly createdAt: string;
};

/** What another module hands `createAlert`: the type is the closed set, the link is optional. */
export type AlertInput = {
	readonly userId: string;
	readonly type: AlertType;
	readonly actorName: string;
	readonly message: string;
	readonly link?: string | null;
};

/**
 * The jsonb stored in `activeSubscriptions.notificationMethods`: the legacy
 * billing half (`email`, `sms`) this module never rewrites on its own, and the
 * sibling `preferences` bag it owns. `preferences` is optional because every
 * row written before the card existed has no such key.
 */
export type AlertNotificationMethods = {
	readonly email: boolean;
	readonly sms: boolean;
	readonly preferences?: AlertPreferences;
};
