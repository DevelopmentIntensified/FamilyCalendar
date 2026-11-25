/**
 * access auth screens' pure UI rules: the copy every auth page renders, the
 * client-side checks a form runs before it calls the server, and the three
 * 3-second beats the pages keep (the resend tick, the reset redirect, the
 * resend confirmation pill).
 *
 * The server is the judge of every refusal (its sentence is shown verbatim);
 * only the checks legacy ran in the browser live here, in legacy's order:
 * signup tests the confirmation match BEFORE the length, reset tests a missing
 * token before the match.
 *
 * Doc: ./README.md#invariants
 */

import { PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT_MESSAGE } from './access.password.rules';

/** Which half of the Password / Email Link switch is up. */
export type AuthMethod = 'password' | 'email-link';

/** The switch's two buttons, in the approved order. */
export const AUTH_METHOD_OPTIONS: ReadonlyArray<{ value: AuthMethod; label: string }> = [
	{ value: 'password', label: 'Password' },
	{ value: 'email-link', label: 'Email Link' }
];

/** How long "Sent again ✓" stays up, and how long the reset page waits before `/login`. */
export const AUTH_CONFIRMATION_MS = 3000;

/** Where the reset page lands itself. */
export const RESET_SUCCESS_PATH = '/login';

// --- Login ------------------------------------------------------------------

export const LOGIN_HEADING = 'Welcome Back';
export const LOGIN_SIGNED_IN_COPY = 'You are already logged in.';
export const LOGIN_MERGE_BANNER =
	"Log in with the account tied to this email, and we'll merge the calendar you've added on this device into it.";
export const LOGIN_CODE_HEADING = 'Check Your Email';
export const LOGIN_CODE_SENT = "We've sent a login code to";
export const LOGIN_CODE_LABEL = 'Login code';
export const LOGIN_CODE_PLACEHOLDER = 'Enter login code';
export const LOGIN_CODE_SUBMIT = 'Login';
export const LOGIN_CODE_BUSY = 'Logging in...';
export const LOGIN_PASSWORD_SUBMIT = 'Login';
export const LOGIN_PASSWORD_BUSY = 'Logging in...';
export const LOGIN_LINK_SUBMIT = 'Send Login Link';
export const LOGIN_LINK_BUSY = 'Sending...';
export const RESEND_SENTENCE = "Didn't receive the code? Resend";
export const RESEND_CONFIRMATION = 'Sent again ✓';
export const FORGOT_PASSWORD_LINK = 'Forgot your password?';
export const GUEST_START_HEADING = 'Start planning — no account needed';
export const GUEST_START_NOTE = 'Creates a private calendar on this device. Add an email later to sync.';

/** Network-failure copy, unchanged from the legacy page's own catch blocks. */
export const LOGIN_FAILED_COPY = 'Failed to login';
export const LOGIN_LINK_FAILED_COPY = 'Failed to send login link';
export const CODE_INVALID_COPY = 'Invalid code';
export const CODE_FAILED_COPY = 'Verification failed';

/**
 * #246: some redirects carry machine codes (`?error=invalid_token` from the
 * invite route). Map them to copy; free-text messages pass through unchanged.
 */
const ERROR_COPY: Record<string, string> = {
	missing_token: 'That invite link is incomplete. Open the link from your email again.',
	invalid_token: 'That invite link has expired or is invalid. Ask for a new invite.'
};

export function authErrorCopy(raw: string): string {
	return ERROR_COPY[raw] ?? raw;
}

/** The landing button's label: the calendar by name, any other target "Continue". */
export function authLandingLabel(redirectTo: string): 'Go to Calendar' | 'Continue' {
	return redirectTo === '/calendar' ? 'Go to Calendar' : 'Continue';
}

/** The other auth page's link, keeping the post-auth target when it is not the calendar. */
export function authSiblingHref(path: '/login' | '/signup', redirectTo: string): string {
	return redirectTo === '/calendar' ? path : `${path}?redirect=${encodeURIComponent(redirectTo)}`;
}

// --- Signup -----------------------------------------------------------------

export const SIGNUP_HEADING = 'Create Account';
export const SIGNUP_SIGNED_IN_COPY = 'You are already logged in.';
export const SIGNUP_CODE_HEADING = 'Check Your Email';
export const SIGNUP_CODE_SENT = "We've sent a verification code to";
export const SIGNUP_CODE_PLACEHOLDER = 'Enter verification code';
export const SIGNUP_CODE_SUBMIT = 'Verify Code';
export const SIGNUP_CODE_BUSY = 'Verifying...';
export const SIGNUP_PASSWORD_SUBMIT = 'Create Account';
export const SIGNUP_PASSWORD_BUSY = 'Creating Account...';
export const SIGNUP_LINK_SUBMIT = 'Send Verification Link';
export const SIGNUP_LINK_BUSY = 'Sending...';
export const PASSWORD_HINT = 'At least 8 characters';
export const PASSWORD_MISMATCH_COPY = 'Passwords do not match';
export const SIGNUP_VERIFIED_TOAST = 'Email verified — welcome to Family Planz.';
export const SIGNUP_FAILED_COPY = 'Failed to create account';
export const SIGNUP_LINK_FAILED_COPY = 'Failed to send verification email';

/**
 * The signup form's own refusal, in legacy's order (match first, then length),
 * or `null` when the form may be posted.
 */
export function signupPasswordRefusal(password: string, confirmPassword: string): string | null {
	if (password !== confirmPassword) return PASSWORD_MISMATCH_COPY;
	if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE;
	return null;
}

// --- Password reset ---------------------------------------------------------

export const FORGOT_HEADING = 'Reset Password';
export const FORGOT_SIGN_IN_SENTENCE = 'Remember your password?';
export const FORGOT_SIGN_IN_LINK = 'Log in';
export const FORGOT_SUBMIT = 'Send Reset Link';
export const FORGOT_BUSY = 'Sending...';
export const FORGOT_SENT_HEADING = 'Check Your Email';
export const FORGOT_SENT_PREFIX = "If an account exists for";
export const FORGOT_SENT_SUFFIX = ", we've sent a password reset link.";
export const FORGOT_FAILED_COPY = 'Failed to send reset email';

export const RESET_HEADING = 'Set New Password';
export const RESET_TITLE = 'Family Planz: Set New Password';
export const RESET_MISSING_TOKEN_COPY =
	'Invalid or missing reset token. Please request a new password reset.';
export const RESET_INVALID_TOKEN_COPY = 'Invalid reset token';
export const RESET_SUBMIT = 'Reset Password';
export const RESET_BUSY = 'Resetting...';
export const RESET_SUCCESS_HEADING = 'Password Reset!';
export const RESET_SUCCESS_REDIRECT_COPY = 'Redirecting to login...';
export const RESET_FAILED_COPY = 'Failed to reset password';

/**
 * The reset form's own refusals in legacy's order: a missing token, then the
 * confirmation match, then the length.
 */
export function resetPasswordRefusal(
	token: string,
	password: string,
	confirmPassword: string
): string | null {
	if (!token) return RESET_INVALID_TOKEN_COPY;
	if (password !== confirmPassword) return PASSWORD_MISMATCH_COPY;
	if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE;
	return null;
}

// --- Verify email change ----------------------------------------------------

export const VERIFY_HEADING = 'Verify Email Change';
export const VERIFY_TOKEN_BODY = 'Click the button below to verify your email change.';
export const VERIFY_TOKEN_SUBMIT = 'Verify Email';
export const VERIFY_BUSY = 'Verifying...';
export const VERIFY_CODE_LABEL = 'Verification Code';
export const VERIFY_CODE_PLACEHOLDER = 'Enter the 8-digit code';
export const VERIFY_CODE_SUBMIT = 'Verify';
export const VERIFY_SUCCESS_EXTRA = 'Your email has been updated. You can now return to your account page.';
export const VERIFY_SUCCESS_LINK = 'Go to Account';
export const VERIFY_SUCCESS_PATH = '/account';
export const VERIFY_FAILED_COPY = 'Failed to verify email';

// --- Shared field labels ----------------------------------------------------

export const EMAIL_LABEL = 'Email';
export const PASSWORD_LABEL = 'Password';
export const CONFIRM_PASSWORD_LABEL = 'Confirm Password';
export const NEW_PASSWORD_LABEL = 'New Password';
export const FIRST_NAME_LABEL = 'First Name';
export const LAST_NAME_LABEL = 'Last Name';
