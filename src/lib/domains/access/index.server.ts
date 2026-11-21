/**
 * access — public server interface: the `/api` endpoint handlers the route
 * files import, the page handlers, and the one retention use-case another
 * module's cron calls.
 *
 * The services behind the handlers stay module-internal: no other module calls
 * one.
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
