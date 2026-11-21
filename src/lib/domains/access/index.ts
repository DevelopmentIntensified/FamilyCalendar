/**
 * access — public isomorphic interface: the auth wire types, the browser
 * calls the auth pages make, the shared redirect rule and the page state
 * classes' copy helpers.
 *
 * Other modules import access ONLY through this file, index.server.ts or
 * ui/index.ts (rule R2). Doc: ./README.md#public-interface
 */
export type { AuthMethod } from './access.auth.rules';
export {
	AUTH_METHOD_OPTIONS,
	authErrorCopy,
	authLandingLabel,
	authSiblingHref
} from './access.auth.rules';
export {
	CALENDAR_LANDING_PATH,
	EMAIL_LINK_LANDING_PATH,
	authRedirectTarget,
	emailLinkRedirectPath
} from './access.redirect.rules';
export {
	createAuthApi,
	type AuthAck,
	type AuthApi,
	type AuthSignedInUser,
	type PasswordSignupResponse,
	type SignedInResponse
} from './access.api';
export { LoginState, type LoginStateOptions } from './access.login.state.svelte';
export { SignupState, type SignupStateOptions } from './access.signup.state.svelte';
export { ForgotPasswordState, ResetPasswordState } from './access.recovery.state.svelte';
export type {
	ChangeEmailActionData,
	ClaimRequestActionData,
	LoginPageData,
	MergeGuestPageData,
	SignupPageData,
	VerifyEmailActionData
} from './access.pages.http.server';

/** The email step a magic link is minted for; a signup code cannot log in. */
export type AuthIntent = 'login' | 'signup';
