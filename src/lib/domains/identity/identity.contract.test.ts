/**
 * The wire contract: every `/api/me/*` body, param and response schema. The
 * 400 copy, its precedence and the absent/non-string coercions are the legacy
 * wire (pinned by `identity.http.db.test.ts`), so the S6 handlers must parse
 * with exactly these schemas. Expected values come from the legacy handlers
 * and the golden, never from running this code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, z } from '$lib/kernel/validation/validators';
import {
	ApiTokenCreateBody,
	ApiTokenIdParams,
	ApiTokenMintedResponse,
	ApiTokenRevokedResponse,
	ApiTokensResponse,
	BODY_NOT_OBJECT_MESSAGE,
	CalendarSettingsPatchBody,
	CalendarSettingsResponse,
	DEFAULT_CALENDAR_UNAVAILABLE_MESSAGE,
	DefaultCalendarSettingsResponse,
	PROFILE_NAMES_REQUIRED_MESSAGE,
	ProfileUpdateBody,
	ProfileUpdatedResponse,
	SessionsRevokedResponse,
	StoredCalendarSettingsResponse,
	TOKEN_ID_REQUIRED_MESSAGE,
	TOKEN_NAME_REQUIRED_MESSAGE
} from './identity.contract';

function messageOf(schema: z.ZodType, value: unknown): string | null {
	const result = schema.safeParse(value);
	return result.success ? null : firstIssueMessage(result.error);
}

describe('wire copy', () => {
	it('keeps the legacy wording verbatim', () => {
		expect([
			BODY_NOT_OBJECT_MESSAGE,
			TOKEN_NAME_REQUIRED_MESSAGE,
			TOKEN_ID_REQUIRED_MESSAGE,
			PROFILE_NAMES_REQUIRED_MESSAGE,
			DEFAULT_CALENDAR_UNAVAILABLE_MESSAGE
		]).toEqual([
			'Invalid JSON',
			'Token name is required',
			'Token id is required',
			'First name and last name are required',
			'Selected default calendar is not available'
		]);
	});
});

describe('ApiTokenCreateBody', () => {
	// accountData.ts:429-443: `name.trim()`, blank refused, then `.slice(0, 60)`.
	it.each<[string, string, string]>([
		['trims both ends', '  My phone  ', 'My phone'],
		['keeps at most 60 characters', 'x'.repeat(70), 'x'.repeat(60)],
		// Q-109 (post-S6): the cut is on UTF-16 units, so the emoji's high
		// surrogate is left alone at unit 60 (Postgres then stores U+FFFD).
		['cuts at 60 UTF-16 units, splitting an emoji', `${'a'.repeat(59)}😀tail`, `${'a'.repeat(59)}\uD83D`],
		['keeps whitespace that sits before the cut', `${'w'.repeat(58)}   more`, `${'w'.repeat(58)}  `]
	])('%s', (_label, name, expected) => {
		expect(ApiTokenCreateBody.parse({ name })).toEqual({ name: expected });
	});

	it.each<[string, unknown]>([
		['an absent name (an empty body reads as {})', {}],
		['a whitespace-only name', { name: '   ' }],
		['a non-string name', { name: 42 }],
		['a null name', { name: null }]
	])('refuses %s with the legacy message', (_label, body) => {
		expect(messageOf(ApiTokenCreateBody, body)).toBe(TOKEN_NAME_REQUIRED_MESSAGE);
	});

	it.each<[string, unknown]>([
		['a JSON array', [1]],
		['a JSON null', null],
		['a JSON string', 'nope'],
		['a JSON number', 5]
	])('answers "Invalid JSON" for %s (legacy readJsonObject)', (_label, body) => {
		expect(messageOf(ApiTokenCreateBody, body)).toBe(BODY_NOT_OBJECT_MESSAGE);
	});
});

describe('ApiTokenIdParams', () => {
	it('passes any non-empty id through untouched (unknown ids are a 200 no-op)', () => {
		expect(ApiTokenIdParams.parse({ id: 'tok-a' })).toEqual({ id: 'tok-a' });
		expect(ApiTokenIdParams.parse({ id: ' ' })).toEqual({ id: ' ' });
	});

	it('refuses an empty id (accountData.ts:446 `if (!tokenId)`)', () => {
		expect(messageOf(ApiTokenIdParams, { id: '' })).toBe(TOKEN_ID_REQUIRED_MESSAGE);
		expect(messageOf(ApiTokenIdParams, {})).toBe(TOKEN_ID_REQUIRED_MESSAGE);
	});
});

describe('ProfileUpdateBody', () => {
	it('trims both names (profile/+server.ts:15-16)', () => {
		expect(ProfileUpdateBody.parse({ firstName: ' Mia ', lastName: ' Lopez' })).toEqual({
			firstName: 'Mia',
			lastName: 'Lopez'
		});
	});

	it('drops every other key, so privilege fields never reach the service', () => {
		expect(
			ProfileUpdateBody.parse({
				firstName: 'Mia',
				lastName: 'Lopez',
				email: 'mass.assigned@evil.test',
				roles: ['admin']
			})
		).toEqual({ firstName: 'Mia', lastName: 'Lopez' });
	});

	it.each<[string, unknown]>([
		['an absent last name', { firstName: 'Mia' }],
		['a non-string name', { firstName: 5, lastName: 'Lopez' }],
		['a spaces-only name', { firstName: '   ', lastName: 'Lopez' }],
		['an empty body (reads as {})', {}]
	])('refuses %s with the legacy message', (_label, body) => {
		expect(messageOf(ProfileUpdateBody, body)).toBe(PROFILE_NAMES_REQUIRED_MESSAGE);
	});

	it.each<[string, unknown]>([
		['a JSON null', null],
		['a JSON string', 'nope'],
		['a JSON array', []]
	])('answers "Invalid JSON" for %s', (_label, body) => {
		expect(messageOf(ProfileUpdateBody, body)).toBe(BODY_NOT_OBJECT_MESSAGE);
	});
});

describe('CalendarSettingsPatchBody', () => {
	it('parses a subset into the patch the merge spreads', () => {
		expect(CalendarSettingsPatchBody.parse({ timeZone: 'Asia/Tokyo' })).toEqual({
			timeZone: 'Asia/Tokyo'
		});
		expect(CalendarSettingsPatchBody.parse({})).toEqual({});
	});

	it('turns an empty defaultCalendarId into null (`b.defaultCalendarId || null`)', () => {
		expect(CalendarSettingsPatchBody.parse({ defaultCalendarId: '' })).toEqual({
			defaultCalendarId: null
		});
	});

	// The golden's 400 table (identity.http.db.test.ts › answers 400 for %j).
	it.each<[unknown, string]>([
		[{ weekStart: 'friday' }, 'Invalid weekStart'],
		[{ timeZone: 'Mars/Base' }, 'Invalid timeZone'],
		[{ timeZone: '' }, 'Invalid timeZone'],
		[{ color: 'red' }, 'Invalid color'],
		[{ defaultView: 'yearView' }, 'Invalid defaultView'],
		[{ verseTranslation: 'esv' }, 'Unknown field: verseTranslation'],
		[{ useCloudAI: false }, 'Unknown field: useCloudAI'],
		[{ useLocalAI: false }, 'Unknown field: useLocalAI'],
		[{ showAdsAsEvents: 'yes' }, 'Invalid showAdsAsEvents'],
		[{ syncEventsToFamilyCalendar: 1 }, 'Invalid syncEventsToFamilyCalendar'],
		[{ autoParseEventDetails: 'yes' }, 'Invalid autoParseEventDetails'],
		[{ showDailyVerse: 'yes' }, 'Invalid showDailyVerse'],
		[{ defaultCalendarId: 5 }, 'Invalid defaultCalendarId'],
		[{ hiddenDashboardModules: [] }, 'Unknown field: hiddenDashboardModules'],
		[{ weekStart: 'friday', bogus: 1 }, 'Unknown field: bogus'],
		[{ timeZone: 'Mars/Base', weekStart: 'friday' }, 'Invalid weekStart'],
		[[1], 'Invalid body'],
		[null, 'Invalid body'],
		['nope', 'Invalid body']
	])('answers 400 for %j with %j', (body, error) => {
		expect(messageOf(CalendarSettingsPatchBody, body)).toBe(error);
	});
});

const storedWire = {
	id: 'settings-a',
	userId: 'user-1',
	weekStart: 'monday',
	timeZone: 'America/Chicago',
	color: '#112233',
	defaultView: 'dashboard',
	defaultCalendarId: 'cal-mine',
	syncEventsToFamilyCalendar: true,
	autoParseEventDetails: false,
	showDailyVerse: true,
	showAdsAsEvents: false,
	hiddenDashboardModules: ['board'],
	useCloudAI: false,
	useLocalAI: true,
	updatedAt: '2026-10-07T13:00:00.000Z'
};

const sparseWire = {
	...storedWire,
	weekStart: 'sunday',
	timeZone: 'UTC',
	color: null,
	defaultView: 'dayView',
	defaultCalendarId: null,
	syncEventsToFamilyCalendar: null,
	autoParseEventDetails: true,
	showDailyVerse: false,
	hiddenDashboardModules: null,
	useCloudAI: true
};

const defaultsWire = {
	weekStart: 'sunday',
	timeZone: 'UTC',
	color: '#3b82f6',
	defaultView: 'dayView',
	defaultCalendarId: null,
	syncEventsToFamilyCalendar: false,
	showAdsAsEvents: false
};

describe('response schemas', () => {
	it('describes the token list with ISO timestamps and no hash', () => {
		const body = {
			tokens: [
				{ id: 'tok-a', name: 'Phone', createdAt: '2026-10-05T08:00:00.000Z', lastUsedAt: null },
				{
					id: 'tok-b',
					name: 'Tablet',
					createdAt: '2026-10-06T08:00:00.000Z',
					lastUsedAt: '2026-10-08T09:30:00.000Z'
				}
			]
		};
		expect(ApiTokensResponse.parse(body)).toEqual(body);
		expect(
			ApiTokensResponse.safeParse({
				tokens: [{ ...body.tokens[0], createdAt: new Date('2026-10-05T08:00:00.000Z') }]
			}).success
		).toBe(false);
	});

	it('describes the mint answer: fp_ + 43 base64url characters and the record', () => {
		const body = {
			token: `fp_${'A'.repeat(42)}-`,
			record: { id: 'tok-1', name: 'My phone', createdAt: '2026-10-07T13:00:00.000Z' }
		};
		expect(ApiTokenMintedResponse.parse(body)).toEqual(body);
		expect(ApiTokenMintedResponse.safeParse({ ...body, token: `fp_${'A'.repeat(42)}` }).success).toBe(
			false
		);
		expect(ApiTokenMintedResponse.safeParse({ ...body, token: `xx_${'A'.repeat(43)}` }).success).toBe(
			false
		);
	});

	it('describes the revoke, profile and revoke-others acknowledgements', () => {
		expect(ApiTokenRevokedResponse.parse({ success: true })).toEqual({ success: true });
		const profile = {
			success: true,
			user: { id: 'user-1', firstName: 'Guest', lastName: 'Person', email: null }
		};
		expect(ProfileUpdatedResponse.parse(profile)).toEqual(profile);
		expect(SessionsRevokedResponse.parse({ success: true, revoked: 2 })).toEqual({
			success: true,
			revoked: 2
		});
		expect(SessionsRevokedResponse.safeParse({ success: true, revoked: -1 }).success).toBe(false);
	});

	it('describes a stored settings row, which never carries verseTranslation', () => {
		expect(StoredCalendarSettingsResponse.parse(storedWire)).toEqual(storedWire);
		expect(StoredCalendarSettingsResponse.parse(sparseWire)).toEqual(sparseWire);
		expect(
			StoredCalendarSettingsResponse.safeParse({ ...storedWire, verseTranslation: 'esv' }).success
		).toBe(false);
	});

	it('describes the no-row defaults as exactly the seven page defaults', () => {
		expect(DefaultCalendarSettingsResponse.parse(defaultsWire)).toEqual(defaultsWire);
		expect(
			DefaultCalendarSettingsResponse.safeParse({ ...defaultsWire, showDailyVerse: false }).success
		).toBe(false);
	});

	it('describes GET/PATCH /api/me/settings with either settings shape and the consent trail', () => {
		const stored = {
			settings: storedWire,
			consentHistory: [
				{ decision: 'withdrawn', recordedAt: '2026-10-03T18:30:00.000Z' },
				{ decision: 'granted', recordedAt: '2026-10-01T10:00:00.000Z' }
			]
		};
		expect(CalendarSettingsResponse.parse(stored)).toEqual(stored);
		const defaults = { settings: defaultsWire, consentHistory: [] };
		expect(CalendarSettingsResponse.parse(defaults)).toEqual(defaults);
		expect(
			CalendarSettingsResponse.safeParse({
				settings: storedWire,
				consentHistory: [{ decision: 'granted', recordedAt: new Date() }]
			}).success
		).toBe(false);
	});
});
