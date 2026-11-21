/**
 * access — public server interface: the `/api` endpoint handlers and the page
 * handlers the route files import. The services behind them stay
 * module-internal: no other module calls one — the ONE exception is the
 * retention prune `app`'s cleanup cron calls.
 *
 * Doc: ./README.md#public-interface
 */
export {
	claimRequestBodyEndpoint,
	changeEmailEndpoint,
	forgotPasswordAction,
	loginCodeEndpoint,
	loginEmailAction,
	loginPasswordAction,
	logoutEndpoint,
	mobileEmailEndpoint,
	mobileForgotEndpoint,
	mobileGuestEndpoint,
	mobileLogoutEndpoint,
	mobilePasswordEndpoint,
	mobileResetEndpoint,
	mobileSignupEndpoint,
	mobileVerifyEndpoint,
	passwordResendAction,
	passwordVerifyAction,
	resendVerificationEndpoint,
	resetPasswordAction,
	signupCodeEndpoint,
	signupEmailAction,
	signupPasswordAction,
	verifyEmailEndpoint
} from './access.http.server';
export {
	changeEmailAction,
	claimPage,
	claimRequestAction,
	claimVerifyAction,
	claimVerifyPage,
	loginCallback,
	loginPage,
	mergeGuestAction,
	mergeGuestPage,
	mergeGuestSkipAction,
	inviteEmailAcceptAction,
	inviteEmailPageLoad,
	signupCallback,
	signupPage,
	verifyEmailAction,
	verifyEmailPage,
	type ChangeEmailActionData,
	type ClaimRequestActionData,
	type LoginPageData,
	type MergeGuestPageData,
	type SignupPageData,
	type VerifyEmailActionData
} from './access.pages.http.server';

/**
 * The guest-stash contract the calendar page's merge gate reads: the cookie a
 * sign-in writes, and the claim check (`/merge-guest` and that gate are the
 * only two callers, and both must agree on what "claimable" means).
 */
export { GUEST_MERGE_COOKIE, isClaimableGuest } from './access.guestMerge.service.server';
export { pruneExpiredClaimTokens } from './access.claim.service.server';

/** The session pipeline's route gate (`src/hooks.server.ts:23-39`): admin-only, or a protected page. */
export { isAdminRoute, isProtectedRoute } from './access.route.rules';
