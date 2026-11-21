/**
 * access — public server interface: the `/api` endpoint handlers and the page
 * handlers the route files import. The services behind them stay
 * module-internal: no other module calls one.
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
