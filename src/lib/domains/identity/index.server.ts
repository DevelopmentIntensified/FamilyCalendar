/**
 * identity — public server interface: services and http handlers, and the two
 * cross-module ports identity declares (add-a-port.md#domain-ports).
 *
 * Identity is rank 1, so it cannot import the modules that own calendar
 * visibility (`calendar`) or the ad-consent trail (`sponsored`). It declares
 * what it needs here; those modules export the adapters (their S5) and
 * `src/lib/app/ports.server.ts` attaches them to the ctx. Until they port,
 * that file bridges both ports over the legacy implementations so the frozen
 * goldens read the real rows.
 *
 * Doc: ./README.md#public-interface
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { ConsentRecordView } from './identity.contract';

/** Implemented by `calendar`: the calendars a person may pick as their default. */
export type CalendarAccessPort = {
	/** Their personal calendars plus the calendar of every family they belong to. */
	listAccessibleCalendarIds(userId: string): Promise<readonly string[]>;
};

/** Implemented by `sponsored`: the ad-consent evidence trail beside `showAdsAsEvents` (#088). */
export type AdConsentPort = {
	/** The person's consent records, newest first. */
	listConsentHistory(userId: string): Promise<readonly ConsentRecordView[]>;
	/**
	 * Appends one record when, and only when, the ad setting changed:
	 * `previous` is the stored value BEFORE the save (`undefined` with no row).
	 */
	recordConsentChange(
		userId: string,
		previous: boolean | null | undefined,
		next: boolean
	): Promise<void>;
};

/** The ports identity's settings service reads (`ctx.calendarAccess`, `ctx.adConsent`). */
export type IdentityPorts = {
	readonly calendarAccess: CalendarAccessPort;
	readonly adConsent: AdConsentPort;
};

/** The ctx the services that need a port take. */
export type IdentityCtx = Ctx & IdentityPorts;

// --- Services -----------------------------------------------------------------

export {
	getPerson,
	getPersonByEmail,
	isEmailTaken,
	listPersonNames,
	createPersonWithPassword,
	createEmailPerson,
	findPersonForSignIn,
	ensurePersonSettings,
	updatePersonProfile,
	verifyPersonEmail,
	setPersonEmail,
	setPersonPassword,
	createAnonymousAccount,
	touchLastActive,
	getTimeZone,
	deletePerson,
	type PersonName,
	type ProfileInput,
	type CreatePersonWithPasswordInput,
	type CreateEmailPersonInput,
	type SignInPersonLookup
} from './identity.person.service.server';
export {
	startSession,
	validateSession,
	endSession,
	endAllSessions,
	endOtherSessions,
	sessionCookie,
	blankSessionCookie,
	type StartedSession,
	type ActiveSession,
	type SessionValidation,
	type SessionCookie
} from './identity.session.service.server';
export {
	listApiTokens,
	mintApiToken,
	revokeApiToken,
	revokeAllApiTokens,
	revokeApiTokenByPlaintext,
	authenticateApiToken,
	type MintedApiToken
} from './identity.token.service.server';

/** The `fp_` prefix every mobile Bearer token must carry (`mobileAuth.ts:357`). */
export { isApiTokenFormat } from './identity.token.rules';
export {
	getCalendarPreferences,
	getCalendarSettings,
	updateCalendarSettings,
	setHiddenDashboardModules,
	type CalendarSettingsResult,
	type StoredCalendarPreferences
} from './identity.settings.service.server';
export {
	hashPassword,
	verifyPassword,
	issueEmailCode,
	redeemEmailCode,
	findEmailCode,
	discardEmailCodes,
	type IssueEmailCodeInput,
	type RedeemEmailCodeInput
} from './identity.credentials.service.server';

/** The app resolves the fail-closed signing secret once at boot. */
export { resolveSessionSecret } from './identity.session.rules';
/** The cookie the browser session rides on — the auth routes read it for the guest stash. */
export { SESSION_COOKIE_NAME } from './identity.session.rules';

/** The untrimmed stored full name (`first + ' ' + last`), the legacy stats shape. */
export { personFullName } from './identity.person.rules';
/** The app resolves the fail-closed email-code pepper once at boot (Q-117). */
export { CODE_PEPPER_PLACEHOLDER, resolveCodePepper } from './identity.code.rules';
export type { PersonView } from './identity.contract';

// --- HTTP handlers ------------------------------------------------------------

export {
	listApiTokensEndpoint,
	createApiTokenEndpoint,
	revokeApiTokenEndpoint,
	updateProfileEndpoint,
	revokeOtherSessionsEndpoint,
	getSettingsEndpoint,
	patchSettingsEndpoint
} from './identity.http.server';
