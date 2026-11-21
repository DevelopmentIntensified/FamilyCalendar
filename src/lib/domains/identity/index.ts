/**
 * identity — public isomorphic interface: contract types and pure rules.
 * Other modules import identity ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export {
	ANONYMOUS_EMAIL_DOMAIN,
	isAnonymousAccount,
	isRegisteredAccount,
	guestSafeEmail,
	displayName
} from './identity.person.rules';
export {
	ACCOUNT_SETTINGS_DEFAULTS,
	calendarSettingsPatch
} from './identity.settings.rules';
export { sessionCookieAttributes } from './identity.session.rules';
export { apiTokenName } from './identity.token.rules';
export type { CalendarSettingsPatch, CalendarSettingsView } from './identity.contract';
