/**
 * The wire contract: every `/api` body and response schema. The 400 copy and
 * the absent-vs-null rules are the legacy wire, so the golden handlers must
 * parse with exactly these schemas at S6. The tables mirror the refusals
 * `alerts.http.db.test.ts` pins, one row per golden case.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, z, type JsonValue } from '$lib/kernel/validation/validators';
import {
	AlertListResponse,
	AlertPreferenceBody,
	AlertPreferenceParams,
	AlertPreferenceSavedResponse,
	AlertPreferencesResponse,
	AlertRow,
	AlertsAckResponse,
	AlertsMarkBody,
	AlertsPrunedResponse,
	DeviceRegistrationBody,
	MAX_DEVICE_TOKEN_LENGTH,
	PushPublicKeyResponse,
	PushSubscriptionBody,
	PushUnsubscribeBody
} from './alerts.contract';
import { ALERT_PREFERENCES, DEFAULT_ALERT_PREFERENCES } from './alerts.preferences.rules';

function messageOf(schema: z.ZodType, value: unknown): string | null {
	const result = schema.safeParse(value);
	return result.success ? null : firstIssueMessage(result.error);
}

const TOKEN = `fcm-${'x'.repeat(40)}`;
const ENDPOINT = 'https://push.example.test/subscription/1';

describe('AlertsMarkBody', () => {
	// POST /api/notifications: all → pruneRead → id, an action only counts with its exact value.
	it.each<[string, JsonValue, unknown]>([
		['mark all', { all: true }, { all: true }],
		['prune read', { pruneRead: true }, { pruneRead: true }],
		['mark one', { id: 'alert-1' }, { id: 'alert-1' }],
		['all wins over pruneRead', { all: true, pruneRead: true }, { all: true }],
		['all wins over an id', { all: true, id: 'alert-1' }, { all: true }],
		['pruneRead wins over an id', { pruneRead: true, id: 'alert-1' }, { pruneRead: true }],
		['a false all falls through to pruneRead', { all: false, pruneRead: true }, { pruneRead: true }],
		['a string all falls through to the id', { all: 'true', id: 'alert-1' }, { id: 'alert-1' }],
		['an id is not trimmed', { id: ' alert-1 ' }, { id: ' alert-1 ' }]
	])('parses %s', (_label, body, expected) => {
		expect(AlertsMarkBody.parse(body)).toEqual(expected);
	});

	// alerts.http.db.test.ts › "answers 400 {"error":"Invalid request body"} for $label"
	it.each<[string, unknown]>([
		['a string body', 'tasks'],
		['a null body', null],
		['a number body', 42],
		['a boolean body', true]
	])('answers Invalid request body for %s', (_label, body) => {
		expect(messageOf(AlertsMarkBody, body)).toBe('Invalid request body');
	});

	// alerts.http.db.test.ts › "answers 400 {"error":"Notification id is required"} for $label"
	it.each<[string, JsonValue]>([
		['no action at all', {}],
		['an empty array body', []],
		['a non-empty array body', ['alert-1']],
		['an empty id', { id: '' }],
		['a non-string id', { id: 42 }],
		['a null id', { id: null }],
		['all as a string', { all: 'true' }],
		['pruneRead as a string', { pruneRead: 'yes' }],
		['all as false with nothing else', { all: false }]
	])('answers Notification id is required for %s', (_label, body) => {
		expect(messageOf(AlertsMarkBody, body)).toBe('Notification id is required');
	});
});

describe('DeviceRegistrationBody', () => {
	it('parses the documented body', () => {
		expect(DeviceRegistrationBody.parse({ token: TOKEN, platform: 'android' })).toEqual({
			token: TOKEN,
			platform: 'android'
		});
	});

	it('defaults an absent platform to android', () => {
		expect(DeviceRegistrationBody.parse({ token: TOKEN }).platform).toBe('android');
	});

	it('trims the token before the emptiness and length checks', () => {
		expect(DeviceRegistrationBody.parse({ token: `  ${' '.repeat(5000)}abc\n` }).token).toBe('abc');
	});

	it('accepts a token of exactly the limit and refuses one character more', () => {
		expect(MAX_DEVICE_TOKEN_LENGTH).toBe(4096);
		expect(
			DeviceRegistrationBody.safeParse({ token: 'x'.repeat(MAX_DEVICE_TOKEN_LENGTH) }).success
		).toBe(true);
		expect(
			messageOf(DeviceRegistrationBody, { token: 'x'.repeat(MAX_DEVICE_TOKEN_LENGTH + 1) })
		).toBe('token is too long');
	});

	// alerts.http.db.test.ts › POST /api/devices › "answers 400 {"error":"token is required"} for $label"
	it.each<[string, unknown]>([
		['a missing token', {}],
		['an empty token', { token: '' }],
		['a blank token', { token: '   ' }],
		['a non-string token', { token: 42 }],
		['a null token', { token: null }],
		['a non-object body', 'token'],
		['a null body', null],
		['an array body', []]
	])('answers token is required for %s', (_label, body) => {
		expect(messageOf(DeviceRegistrationBody, body)).toBe('token is required');
	});

	// alerts.http.db.test.ts › "answers 400 {"error":"platform must be 'android'"} for $label"
	it.each<[string, unknown]>([
		['an ios platform', 'ios'],
		['a null platform', null],
		['a case-variant platform', 'ANDROID'],
		['a non-string platform', 7]
	])("answers platform must be 'android' for %s", (_label, platform) => {
		expect(messageOf(DeviceRegistrationBody, { token: TOKEN, platform })).toBe(
			"platform must be 'android'"
		);
	});

	// DELETE shares this parser: the token is checked before the platform.
	it('reports the token problem before the platform problem', () => {
		expect(messageOf(DeviceRegistrationBody, { token: '', platform: 'ios' })).toBe(
			'token is required'
		);
		expect(
			messageOf(DeviceRegistrationBody, { token: 'x'.repeat(4097), platform: 'ios' })
		).toBe('token is too long');
	});
});

describe('PushSubscriptionBody', () => {
	const keys = { p256dh: 'p256dh-key', auth: 'auth-key' };

	it('parses the subscription and drops what it does not know', () => {
		expect(
			PushSubscriptionBody.parse({ endpoint: ENDPOINT, keys, expirationTime: null })
		).toEqual({ endpoint: ENDPOINT, keys });
	});

	it('keeps whitespace in the endpoint and keys as posted', () => {
		const body = { endpoint: ` ${ENDPOINT} `, keys: { p256dh: ' k ', auth: ' a ' } };
		expect(PushSubscriptionBody.parse(body)).toEqual(body);
	});

	// alerts.http.db.test.ts › POST /api/push/subscribe › "answers 400 {"error":"Invalid subscription payload"} for $label"
	it.each<[string, unknown]>([
		['an empty body', {}],
		['a missing keys object', { endpoint: ENDPOINT }],
		['an empty endpoint', { endpoint: '', keys }],
		['a non-string endpoint', { endpoint: 42, keys }],
		['an empty keys object', { endpoint: ENDPOINT, keys: {} }],
		['a missing auth key', { endpoint: ENDPOINT, keys: { p256dh: 'k' } }],
		['an empty p256dh', { endpoint: ENDPOINT, keys: { p256dh: '', auth: 'a' } }],
		['a null keys object', { endpoint: ENDPOINT, keys: null }],
		['an array keys object', { endpoint: ENDPOINT, keys: [] }],
		['a non-object body', 'subscription'],
		['a null body', null]
	])('answers Invalid subscription payload for %s', (_label, body) => {
		expect(messageOf(PushSubscriptionBody, body)).toBe('Invalid subscription payload');
	});
});

describe('PushUnsubscribeBody', () => {
	it('parses the endpoint', () => {
		expect(PushUnsubscribeBody.parse({ endpoint: ENDPOINT })).toEqual({ endpoint: ENDPOINT });
	});

	// alerts.http.db.test.ts › POST /api/push/unsubscribe › "answers 400 {"error":"Invalid request body"} for $label"
	it.each<[string, unknown]>([
		['an empty body', {}],
		['an empty endpoint', { endpoint: '' }],
		['a non-string endpoint', { endpoint: 42 }],
		['a null endpoint', { endpoint: null }],
		['a non-object body', 'endpoint'],
		['a null body', null]
	])('answers Invalid request body for %s', (_label, body) => {
		expect(messageOf(PushUnsubscribeBody, body)).toBe('Invalid request body');
	});
});

describe('the preference save', () => {
	it.each(ALERT_PREFERENCES.map((option) => [option.id]))('accepts the id %s', (id) => {
		expect(AlertPreferenceParams.parse({ id })).toEqual({ id });
	});

	// alerts.http.db.test.ts › PUT /api/me/notification-preferences/[id] › "answers 400 … Unknown notification preference for an id outside the four"
	it.each<[string, unknown]>([
		['an id outside the four', 'email'],
		['a case variant', 'TaskAssigned'],
		['an empty id', ''],
		['a missing id', undefined]
	])('answers Unknown notification preference for %s', (_label, id) => {
		expect(messageOf(AlertPreferenceParams, { id })).toBe('Unknown notification preference');
	});

	it.each<[string, boolean]>([
		['on', true],
		['off', false]
	])('parses a %s value', (_label, value) => {
		expect(AlertPreferenceBody.parse({ value })).toEqual({ value });
	});

	// alerts.http.db.test.ts › "answers 400 … Notification preference value is required for $label"
	it.each<[string, JsonValue]>([
		['a missing value', {}],
		['a string value', { value: 'true' }],
		['a null value', { value: null }],
		['a numeric value', { value: 1 }]
	])('answers Notification preference value is required for %s', (_label, body) => {
		expect(messageOf(AlertPreferenceBody, body)).toBe('Notification preference value is required');
	});

	// alerts.http.db.test.ts › "answers 400 {"error":"Invalid JSON"} for a non-object body"
	it.each<[string, JsonValue]>([
		['an array body', ['on']],
		['a string body', 'on'],
		['a null body', null]
	])('answers Invalid JSON for %s', (_label, body) => {
		expect(messageOf(AlertPreferenceBody, body)).toBe('Invalid JSON');
	});
});

describe('response schemas', () => {
	const alertWire = {
		id: 'a1',
		type: 'assignment_pending',
		rawType: 'assignment_pending',
		group: 'needs_you',
		actorName: 'Kim',
		message: 'asked you to take "Bins"',
		link: '/calendar/tasks',
		readAt: null as string | null,
		createdAt: '2026-03-04 10:00:00+00'
	};

	it('describes an Alert row, an unrecognised one included', () => {
		expect(AlertRow.parse(alertWire)).toEqual(alertWire);
		const unknown = { ...alertWire, type: null, rawType: 'mystery_type', group: 'news', link: null };
		expect(AlertRow.parse(unknown)).toEqual(unknown);
	});

	// notifications.readAt/createdAt are `mode: 'string'`: the wire is the driver's render and nothing else, so a
	// later switch to ISO (a wire change) must fail here.
	it.each<[string, string, boolean]>([
		['the Postgres render', '2026-03-04 10:00:00+00', true],
		['the Postgres render with fractional seconds', '2026-03-04 10:00:00.123456+00', true],
		['the Postgres render with a minute offset', '2026-03-04 10:00:00+01:00', true],
		['an ISO instant', '2026-03-04T10:00:00.000Z', false],
		['an ISO instant with an offset', '2026-03-04T10:00:00+01:00', false],
		['a Postgres render ending in Z', '2026-03-04 10:00:00Z', false],
		['a bare date', '2026-03-04', false],
		['free text', 'yesterday', false],
		['the empty string', '', false]
	])('takes %s as a timestamp: %s', (_label, createdAt, accepted) => {
		expect(AlertRow.safeParse({ ...alertWire, createdAt }).success).toBe(accepted);
	});

	it('refuses a Date, a type outside the five and a group outside the two', () => {
		expect(AlertRow.safeParse({ ...alertWire, createdAt: new Date() }).success).toBe(false);
		expect(AlertRow.safeParse({ ...alertWire, readAt: new Date() }).success).toBe(false);
		expect(AlertRow.safeParse({ ...alertWire, type: 'mystery_type' }).success).toBe(false);
		expect(AlertRow.safeParse({ ...alertWire, group: 'urgent' }).success).toBe(false);
	});

	it('describes the feed answer', () => {
		const feed = { notifications: [alertWire], unreadCount: 3 };
		expect(AlertListResponse.parse(feed)).toEqual(feed);
		expect(AlertListResponse.parse({ notifications: [], unreadCount: 0 })).toEqual({
			notifications: [],
			unreadCount: 0
		});
		expect(AlertListResponse.safeParse({ notifications: [], unreadCount: -1 }).success).toBe(false);
		expect(AlertListResponse.safeParse({ alerts: [], unreadCount: 0 }).success).toBe(false);
	});

	it('describes the acknowledgements', () => {
		expect(AlertsAckResponse.parse({ success: true })).toEqual({ success: true });
		expect(AlertsAckResponse.safeParse({ success: 'yes' }).success).toBe(false);
		expect(AlertsPrunedResponse.parse({ success: true, removed: 0 })).toEqual({
			success: true,
			removed: 0
		});
		expect(AlertsPrunedResponse.safeParse({ success: true }).success).toBe(false);
	});

	it('describes the public key, null when unset', () => {
		expect(PushPublicKeyResponse.parse({ publicKey: null })).toEqual({ publicKey: null });
		expect(PushPublicKeyResponse.parse({ publicKey: 'BPublicKeyForTests' })).toEqual({
			publicKey: 'BPublicKeyForTests'
		});
		expect(PushPublicKeyResponse.safeParse({}).success).toBe(false);
	});

	it('describes the preferences answer: the four switches and the four options', () => {
		const answer = { preferences: DEFAULT_ALERT_PREFERENCES, options: ALERT_PREFERENCES };
		expect(AlertPreferencesResponse.parse(answer)).toEqual(answer);
		expect(
			AlertPreferencesResponse.safeParse({
				preferences: { taskAssigned: true },
				options: ALERT_PREFERENCES
			}).success
		).toBe(false);
	});

	it('describes the save receipt', () => {
		const receipt = { success: true, message: 'Task completed alerts are off. Saved.' };
		expect(AlertPreferenceSavedResponse.parse(receipt)).toEqual(receipt);
		expect(AlertPreferenceSavedResponse.safeParse({ success: true }).success).toBe(false);
	});
});
