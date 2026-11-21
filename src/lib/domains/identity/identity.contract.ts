/**
 * identity contract: the zod schemas and types for every `/api/me/*` body,
 * param and response (dates on the wire are ISO strings). Server-side row
 * shapes with real `Date`s live at the bottom.
 *
 * The error copy is the wire: the golden tests pin it
 * (`identity.http.db.test.ts`). Keep the legacy wording.
 *
 * Security: no response schema here carries a token hash or a password hash.
 * The plaintext `fp_` token appears in exactly one schema, the mint answer,
 * because that is the only time it is shown.
 *
 * The settings vocabularies, the PATCH validator and the token-name cut live
 * in the rules files (a closed vocabulary is a rule); this file parses with
 * them, so each has one home.
 *
 * Doc: ./README.md#invariants
 */
import { INVALID_JSON_MESSAGE, isoInstant, requiredText, z } from '$lib/kernel/validation/validators';
import { calendarSettingsPatch, type ACCOUNT_SETTINGS_DEFAULTS } from './identity.settings.rules';
import { API_TOKEN_PREFIX, apiTokenName } from './identity.token.rules';

// --- Wire copy --------------------------------------------------------------

/** `POST /api/me/api-tokens` with an absent, non-string or blank name. */
export const TOKEN_NAME_REQUIRED_MESSAGE = 'Token name is required';

/** `DELETE /api/me/api-tokens/:id` with an empty id. */
export const TOKEN_ID_REQUIRED_MESSAGE = 'Token id is required';

/** `PATCH /api/me/profile` with a missing, blank or non-string name. */
export const PROFILE_NAMES_REQUIRED_MESSAGE = 'First name and last name are required';

/** `PATCH /api/me/settings` setting a default calendar the caller cannot see. */
export const DEFAULT_CALENDAR_UNAVAILABLE_MESSAGE = 'Selected default calendar is not available';

/** Legacy routes read a non-string name as `''`, so it gets the "required" copy, not a type error. */
function textOrEmpty(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

// --- `/api/me/api-tokens` ---------------------------------------------------

/**
 * `POST /api/me/api-tokens`. The name is trimmed, refused when blank and cut
 * at 60 UTF-16 units (`apiTokenName`; Q-109 moves the cut to code points after
 * S6). A non-object body is "Invalid JSON"; an empty body reads as `{}`.
 */
export const ApiTokenCreateBody = z.object(
	{
		name: z.preprocess(
			textOrEmpty,
			z
				.string()
				.transform(apiTokenName)
				.pipe(z.string().min(1, { error: TOKEN_NAME_REQUIRED_MESSAGE }))
		)
	},
	{ error: INVALID_JSON_MESSAGE }
);
export type ApiTokenCreateBody = z.infer<typeof ApiTokenCreateBody>;

/**
 * `DELETE /api/me/api-tokens/:id`. Not trimmed: any non-empty id is looked up
 * owner-scoped, and an unknown or foreign id is the same 200.
 */
export const ApiTokenIdParams = z.object({
	id: z.string({ error: TOKEN_ID_REQUIRED_MESSAGE }).min(1, { error: TOKEN_ID_REQUIRED_MESSAGE })
});
export type ApiTokenIdParams = z.infer<typeof ApiTokenIdParams>;

// --- `/api/me/profile` ------------------------------------------------------

const personName = z.preprocess(textOrEmpty, requiredText(PROFILE_NAMES_REQUIRED_MESSAGE));

/**
 * `PATCH /api/me/profile`. Both names are trimmed and required; every other
 * key is dropped, so a privilege field never reaches the write.
 */
export const ProfileUpdateBody = z.object(
	{ firstName: personName, lastName: personName },
	{ error: INVALID_JSON_MESSAGE }
);
export type ProfileUpdateBody = z.infer<typeof ProfileUpdateBody>;

// --- `/api/me/settings` -----------------------------------------------------

/**
 * `PATCH /api/me/settings`: any subset of the nine patchable fields. The
 * validation order and copy are legacy `parsePatch`'s (`calendarSettingsPatch`),
 * so this schema only lifts its refusal into a zod issue.
 *
 * The empty-body case is the endpoint's, not this schema's: legacy answered
 * an EMPTY body with `Invalid JSON` (`request.json()` throws), so the handler
 * sets `bodyMode: 'strict'` and only parseable bodies reach this schema.
 */
export const CalendarSettingsPatchBody = z.unknown().transform((body, ctx) => {
	const result = calendarSettingsPatch(body);
	if (!result.ok) {
		ctx.addIssue({ code: 'custom', message: result.error, input: body });
		return z.NEVER;
	}
	return result.patch;
});
export type CalendarSettingsPatchBody = z.infer<typeof CalendarSettingsPatchBody>;

// --- Wire rows and responses -----------------------------------------------

/** A token as the list shows it: never the hash. */
export const ApiTokenListingResponse = z.object({
	id: z.string(),
	name: z.string(),
	createdAt: isoInstant(),
	lastUsedAt: isoInstant().nullable()
});
export type ApiTokenListingResponse = z.infer<typeof ApiTokenListingResponse>;

/** `GET /api/me/api-tokens`. The order is not part of the contract (Q-110). */
export const ApiTokensResponse = z.object({ tokens: z.array(ApiTokenListingResponse) });
export type ApiTokensResponse = z.infer<typeof ApiTokensResponse>;

/** The stored record a mint answers with (the name as the database stored it). */
export const ApiTokenRecordResponse = z.object({
	id: z.string(),
	name: z.string(),
	createdAt: isoInstant()
});
export type ApiTokenRecordResponse = z.infer<typeof ApiTokenRecordResponse>;

/** `201` from `POST /api/me/api-tokens`: the plaintext, shown this once. */
export const ApiTokenMintedResponse = z.object({
	token: z.string().regex(new RegExp(`^${API_TOKEN_PREFIX}[A-Za-z0-9_-]{43}$`)),
	record: ApiTokenRecordResponse
});
export type ApiTokenMintedResponse = z.infer<typeof ApiTokenMintedResponse>;

/** `DELETE /api/me/api-tokens/:id` — the same 200 whether or not a row went. */
export const ApiTokenRevokedResponse = z.object({ success: z.literal(true) });
export type ApiTokenRevokedResponse = z.infer<typeof ApiTokenRevokedResponse>;

/**
 * `PATCH /api/me/profile`: the trimmed names as sent, and the caller's email
 * with an Anonymous Account's placeholder masked to `null`.
 */
export const ProfileUpdatedResponse = z.object({
	success: z.literal(true),
	user: z.object({
		id: z.string(),
		firstName: z.string(),
		lastName: z.string(),
		email: z.string().nullable()
	})
});
export type ProfileUpdatedResponse = z.infer<typeof ProfileUpdatedResponse>;

/** `POST /api/me/sessions/revoke-others`: how many web sessions went. */
export const SessionsRevokedResponse = z.object({
	success: z.literal(true),
	revoked: z.number().int().min(0)
});
export type SessionsRevokedResponse = z.infer<typeof SessionsRevokedResponse>;

/**
 * A stored settings row on the wire: every column except `verseTranslation`
 * (stripped since Q-031/Q-032). Strict, so a leaked column fails the parse.
 * `useCloudAI`/`useLocalAI` are echoed read-only (Q-014).
 */
export const StoredCalendarSettingsResponse = z.strictObject({
	id: z.string(),
	userId: z.string(),
	weekStart: z.string().nullable(),
	timeZone: z.string().nullable(),
	color: z.string().nullable(),
	defaultView: z.string().nullable(),
	defaultCalendarId: z.string().nullable(),
	syncEventsToFamilyCalendar: z.boolean().nullable(),
	autoParseEventDetails: z.boolean().nullable(),
	showDailyVerse: z.boolean().nullable(),
	showAdsAsEvents: z.boolean().nullable(),
	hiddenDashboardModules: z.array(z.string()).nullable(),
	useCloudAI: z.boolean().nullable(),
	useLocalAI: z.boolean().nullable(),
	updatedAt: isoInstant()
});
export type StoredCalendarSettingsResponse = z.infer<typeof StoredCalendarSettingsResponse>;

/** The no-row view: exactly `ACCOUNT_SETTINGS_DEFAULTS`, nothing else. */
export const DefaultCalendarSettingsResponse = z.strictObject({
	weekStart: z.string(),
	timeZone: z.string(),
	color: z.string(),
	defaultView: z.string(),
	defaultCalendarId: z.null(),
	syncEventsToFamilyCalendar: z.boolean(),
	showAdsAsEvents: z.boolean()
});
export type DefaultCalendarSettingsResponse = z.infer<typeof DefaultCalendarSettingsResponse>;

/** One consent-trail entry (`decision` is the sponsored vocabulary, stored as text). */
export const ConsentHistoryEntryResponse = z.object({
	decision: z.string(),
	recordedAt: isoInstant()
});
export type ConsentHistoryEntryResponse = z.infer<typeof ConsentHistoryEntryResponse>;

/**
 * `GET /api/me/settings`, and `PATCH` answers the same shape after a save:
 * the stored row (or the page defaults) plus the consent trail, newest first.
 */
export const CalendarSettingsResponse = z.object({
	settings: z.union([StoredCalendarSettingsResponse, DefaultCalendarSettingsResponse]),
	consentHistory: z.array(ConsentHistoryEntryResponse)
});
export type CalendarSettingsResponse = z.infer<typeof CalendarSettingsResponse>;

// --- Server-side row shapes ------------------------------------------------

/**
 * The caller's own person as `getPerson`/`updatePersonProfile` answer it.
 * `email` has passed `guestSafeEmail`, so an Anonymous Account's placeholder
 * domain never leaves the server. No `/api` route answers a person directly
 * (the `/api/me` shell is account's), so this is a type, not a wire schema.
 */
export type PersonView = {
	readonly id: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string | null;
	readonly emailVerified: boolean | null;
	readonly isAnonymous: boolean;
	readonly roles: readonly string[];
	readonly lastActiveAt: Date | null;
};

/**
 * A `userSettings` row as the repo returns it and the rules read it. Never
 * sent directly: `calendarSettingsView` strips `verseTranslation` first.
 */
export type StoredCalendarSettings = {
	readonly id: string;
	readonly userId: string;
	readonly weekStart: string | null;
	readonly timeZone: string | null;
	readonly color: string | null;
	readonly syncEventsToFamilyCalendar: boolean | null;
	readonly showAdsAsEvents: boolean | null;
	readonly autoParseEventDetails: boolean | null;
	readonly useCloudAI: boolean | null;
	readonly useLocalAI: boolean | null;
	readonly showDailyVerse: boolean | null;
	readonly verseTranslation: string | null;
	/** Mutable element type: drizzle's `text[]` writer takes `string[]`. */
	readonly hiddenDashboardModules: string[] | null;
	readonly updatedAt: Date;
	readonly defaultCalendarId: string | null;
	readonly defaultView: string | null;
};

/** A stored row as a client may see it. */
export type StoredCalendarSettingsView = Omit<StoredCalendarSettings, 'verseTranslation'>;

/** What a person with no settings row sees. */
export type AccountSettingsDefaults = typeof ACCOUNT_SETTINGS_DEFAULTS;

/** The settings card's data: the stored row, or the defaults when there is none. */
export type CalendarSettingsView = StoredCalendarSettingsView | AccountSettingsDefaults;

/**
 * The full set a calendar-settings save writes (legacy `CalendarSettingsInput`).
 * `showDailyVerse` is optional because the /account form never posts it, so a
 * form save leaves the stored value alone; the PATCH merge always fills it.
 */
export type CalendarSettingsInput = {
	readonly weekStart: string;
	readonly timeZone: string;
	readonly color: string;
	readonly defaultView: string;
	readonly defaultCalendarId: string | null;
	readonly syncEventsToFamilyCalendar: boolean;
	readonly autoParseEventDetails: boolean;
	readonly showDailyVerse?: boolean;
	readonly showAdsAsEvents: boolean;
};

/** A validated PATCH: only the keys the body sent. */
export type CalendarSettingsPatch = Partial<CalendarSettingsInput>;

/** One consent-trail entry as `AdConsentPort.listConsentHistory` returns it. */
export type ConsentRecordView = {
	readonly decision: string;
	readonly recordedAt: Date;
};

/** A token as the list reads it: no hash column is ever selected. */
export type ApiTokenListing = {
	readonly id: string;
	readonly name: string;
	readonly createdAt: Date;
	readonly lastUsedAt: Date | null;
};

/** The minted row's safe columns. */
export type ApiTokenRecord = {
	readonly id: string;
	readonly name: string;
	readonly createdAt: Date;
};
