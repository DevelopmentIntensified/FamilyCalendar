/**
 * access contract: the zod schemas, wire copy and view types for every `/api`
 * route this module owns (the eight `/api/mobile/auth/*` routes, `/api/logout`,
 * `/api/me/claim`, `/api/me/email`, `/api/me/verify-email` and its resend) and
 * the two page-group code JSON endpoints.
 *
 * The error copy is the wire: the frozen golden (`access.http.db.test.ts`)
 * pins it, so every sentence below is the legacy sentence, verbatim —
 * including the capitalised typo on the signup page-code endpoint.
 *
 * Coercions are the legacy boundary's, not zod's defaults:
 * - every mobile field is read with `typeof value === 'string' ? value : ''`
 *   (`mobileAuth.ts:139-152`), and `password`/`deviceName` are NOT trimmed;
 * - a mobile body that is not a JSON object is `Request body must be JSON`
 *   (mobile routes), while the house copy `Invalid JSON` belongs to
 *   `/api/me/*` and `/api/mobile/auth/signup`;
 * - `intent` reads anything but the two literals as "missing", so the handler
 *   answers the intent sentence rather than a type error;
 * - a non-string `email` reads as `''` on every route, and the claim route
 *   trims + lowercases before its own dot rule.
 *
 * Two flows cannot be expressed through the schema alone, because their
 * legacy handlers answer a 500 for a malformed body (`forgot`, `reset`) or
 * distinguish an empty body from a literal `null` (`mobile/auth/guest`). S6
 * owns that mapping; the constants it needs are here.
 *
 * Doc: ./README.md#invariants
 */
import {
	emailAddress,
	INVALID_JSON_MESSAGE,
	oneOf,
	z
} from '$lib/kernel/validation/validators';
import { MAGIC_LINK_KINDS } from './access.email.rules';

// --- Wire copy --------------------------------------------------------------

/** Mobile JSON boundary: "the body is not a JSON object" (`mobileAuth.ts:66`). */
export const MOBILE_JSON_MESSAGE = 'Request body must be JSON';

/** The mobile address rule is the full pattern (`mobileAuth.ts:102-103`). */
export const MOBILE_INVALID_EMAIL_MESSAGE = 'Enter a valid email';

/** `intent` is a closed vocabulary: anything else is missing (`mobileAuth.ts:68`). */
export const MOBILE_INVALID_INTENT_MESSAGE = 'intent must be "login" or "signup"';

/** Signup needs both names (`mobileAuth.ts:69`). */
export const MOBILE_MISSING_NAME_MESSAGE = 'First and last name are required';

/** The mobile limiter's copy (`mobileAuth.ts:70`). */
export const MOBILE_RATE_LIMIT_MESSAGE = 'Too many attempts — try again in a few minutes';

/** Wrong, expired, other-intent or orphaned code: one sentence (`mobileAuth.ts:71`). */
export const MOBILE_WRONG_CODE_MESSAGE = 'That code is wrong or expired';

/** Password sign-in without both fields (`mobileAuth.ts:73`). */
export const MOBILE_MISSING_PASSWORD_MESSAGE = 'Email and password are required';

/** One generic credential refusal (`mobileAuth.ts:72`). */
export const MOBILE_WRONG_PASSWORD_MESSAGE = 'Email or password is incorrect';

/** Mobile signup for an address that got registered meanwhile (`mobileAuth.ts:74`). */
export const MOBILE_ACCOUNT_EXISTS_MESSAGE =
	'An account with this email already exists — sign in instead';

/** A mobile email that could not be sent (`mobileAuth.ts:75`). */
export const MOBILE_SEND_FAILED_MESSAGE = "Couldn't send the email — try again";

/** The mobile throw guard's JSON 500 (`mobileAuth.ts:371-372`). */
export const MOBILE_SERVER_ERROR_MESSAGE = 'Something went wrong — try again';

/** Signed-out `/api/me/*` and mobile Bearer refusals (`requireUser.ts`, `mobileAuth.ts:77`). */
export const UNAUTHORIZED_MESSAGE = 'Unauthorized';

/** The web/mobile `/api` limiter's copy (`forgot-password/+server.ts:59`). */
export const RATE_LIMIT_MESSAGE = 'Too many attempts. Try again shortly.';

/** The page sign-in/sign-up routes' address copy (`login/email`, `signup/email`). */
export const INVALID_EMAIL_MESSAGE = 'Invalid email';

/** The page sign-up's names copy (`signup/email/+server.ts`). */
export const MISSING_NAME_MESSAGE = 'First and last name are required';

/** Password signup with a blank field (`passwordSignup.ts:71`). */
export const SIGNUP_FIELDS_REQUIRED_MESSAGE = 'All fields are required';

/** Web password sign-in's one refusal (`login/password/+server.ts:36`). */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

/** A passwordless account at the password door (`login/password/+server.ts:37`). */
export const EMAIL_LOGIN_REQUIRED_MESSAGE = 'Please use email login for this account';

/** A registered person cannot claim (already has an email) (`claimRequest.ts:54`). */
export const CLAIM_ACCOUNT_HAS_EMAIL_MESSAGE = 'Account already has an email';

/** The Claim address rule requires a dot (`claimRequest.ts:57`). */
export const CLAIM_INVALID_EMAIL_MESSAGE = 'Please enter a valid email address';

/** The Claim link email could not be sent (`claimRequest.ts:84`). */
export const CLAIM_SEND_FAILED_MESSAGE = 'Failed to send email. Please try again.';

/** Email change for an Anonymous Account (`accountData.ts:326-330`). */
export const EMAIL_CHANGE_GUEST_MESSAGE =
	"You're using a guest calendar — add your first email from the Save-your-calendar banner instead.";

/** Email change keeps only `!email || !email.includes('@')` (`accountData.ts:338`). */
export const EMAIL_CHANGE_INVALID_MESSAGE = 'Valid email is required';

/** Email change to the address already on the account (`accountData.ts:341`). */
export const EMAIL_CHANGE_SAME_MESSAGE = 'New email must be different from current email';

/** `/api/me/email` success (`accountData.ts:392-395`). */
export const EMAIL_CHANGE_SENT_MESSAGE = 'Verification email sent. Please check your inbox.';

/** `/api/me/email` send failure (`accountData.ts:386-389`). */
export const EMAIL_CHANGE_SEND_FAILED_MESSAGE = 'Failed to send verification email';

/** Wrong/expired/wrong-email/wrong-type code: ONE sentence (`signup/password/verify`). */
export const VERIFY_GENERIC_ERROR_MESSAGE = 'Unexpected error, please try again';

/** The resend handler's 500 (`signup/password/resend/+server.ts:99-102`). */
export const RESEND_FAILED_MESSAGE = 'There was an error. Please try again.';

/** Forgot-password's only input check is `!email` (`forgot-password/+server.ts:50`). */
export const FORGOT_EMAIL_REQUIRED_MESSAGE = 'Email is required';

/** Forgot's 500, also used for a malformed body today (`forgot-password/+server.ts:89-91`). */
export const FORGOT_SEND_FAILED_MESSAGE = 'Failed to send reset email';

/** Reset without a token or password (`reset/+server.ts:70-72`). */
export const RESET_FIELDS_REQUIRED_MESSAGE = 'Token and password are required';

/** The reset JWT did not verify (`reset/+server.ts:83-85`). */
export const RESET_INVALID_TOKEN_MESSAGE = 'Invalid or expired reset token. Please request a new one.';

/** The reset JWT verified but carries no email claim (`reset/+server.ts:88-96`). */
export const RESET_INVALID_PAYLOAD_MESSAGE = 'Invalid reset token';

/** The durable `used:` marker already exists (`reset/+server.ts:102-105`). */
export const RESET_USED_MESSAGE = 'This reset link has already been used. Please request a new one.';

/** No account behind a signed reset token (`reset/+server.ts:107-110`). */
export const RESET_ACCOUNT_NOT_FOUND_MESSAGE = 'Account not found';

/** Any other reset failure (`reset/+server.ts:133-135`). */
export const RESET_FAILED_MESSAGE = 'Failed to reset password';

/** A password-signup verification email carries no clickable link, only the code. */
export const PASSWORD_VERIFY_CALLBACK_PATH = '/signup/password/verify';

/** `POST /api/logout` answers `302 /` whether or not a session existed. */
export const LOGOUT_REDIRECT_PATH = '/';

// --- Boundary helpers -------------------------------------------------------

/** Legacy boundary read: a non-string field is the empty string. */
function textOrEmpty(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/** A mobile body must be a JSON object; anything else gets the mobile sentence. */
function mobileObject<S extends z.ZodRawShape>(shape: S) {
	return z.preprocess(
		(value) =>
			typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null,
		z.object(shape, { error: MOBILE_JSON_MESSAGE })
	);
}

/**
 * The two web-forwarded handlers destructure `await request.json()` before
 * reading a field: only a literal `null` throws, and Q-062 B answers that with
 * the house `400 Invalid JSON`. An array, a scalar or a missing key reads as
 * "no field" and reaches the route's own 400 checks.
 */
function destructuredObject<S extends z.ZodRawShape>(shape: S, error: string) {
	return z.preprocess(
		(value) =>
			value === null ? null : typeof value === 'object' && !Array.isArray(value) ? value : {},
		z.object(shape, { error })
	);
}

const textField = z.preprocess(textOrEmpty, z.string());
const trimmedField = z.preprocess(textOrEmpty, z.string().trim());
const mobileEmail = z.preprocess(textOrEmpty, emailAddress(MOBILE_INVALID_EMAIL_MESSAGE));

/** `login` / `signup` exactly; anything else reads as missing, never as a type error. */
const mobileIntent = z.preprocess(
	(value) => (MAGIC_LINK_KINDS.some((kind) => kind === value) ? value : null),
	oneOf(MAGIC_LINK_KINDS, MOBILE_INVALID_INTENT_MESSAGE)
);

// --- `/api/mobile/auth/*` ---------------------------------------------------

/**
 * `POST /api/mobile/auth/email`. Order is the handler's: address, then intent,
 * then (for signup only) the names. A malformed or non-object body is the
 * mobile JSON sentence.
 */
export const MobileEmailBody = mobileObject({
	email: mobileEmail,
	intent: mobileIntent,
	firstName: trimmedField,
	lastName: trimmedField
});
export type MobileEmailBody = z.infer<typeof MobileEmailBody>;

/**
 * `POST /api/mobile/auth/verify`. `code` is only trimmed: an absent code is
 * the generic wrong-code refusal, not a validation error. `deviceName` is
 * untrimmed here; the token-name rule trims it.
 */
export const MobileVerifyBody = mobileObject({
	email: mobileEmail,
	intent: mobileIntent,
	code: trimmedField,
	deviceName: textField
});
export type MobileVerifyBody = z.infer<typeof MobileVerifyBody>;

/**
 * `POST /api/mobile/auth/password`. There is NO address-format check on this
 * route; only truthiness (`email`/`password`), kept in the handler.
 */
export const MobilePasswordBody = mobileObject({
	email: trimmedField,
	password: textField,
	deviceName: textField
});
export type MobilePasswordBody = z.infer<typeof MobilePasswordBody>;

/**
 * `POST /api/mobile/auth/guest` — optional fields only. An EMPTY body is
 * `{}`; a literal `null` is refused with the mobile JSON sentence. S6 must
 * keep that distinction (see the file header).
 */
export const MobileGuestBody = mobileObject({ deviceName: textField });
export type MobileGuestBody = z.infer<typeof MobileGuestBody>;

/**
 * `POST /api/mobile/auth/signup` — the web signup's contract, signed in with
 * an `fp_` token. All four account fields are trimmed except the password.
 * A malformed body is the house `Invalid JSON` (`signup/+server.ts:49-51`).
 */
export const MobileSignupBody = z.object(
	{
		email: trimmedField,
		password: textField,
		firstName: trimmedField,
		lastName: trimmedField,
		deviceName: textField
	},
	{ error: INVALID_JSON_MESSAGE }
);
export type MobileSignupBody = z.infer<typeof MobileSignupBody>;

/** The person every mobile answer carries: no hash, no placeholder email. */
export const MobileAuthUserResponse = z.object({
	id: z.string(),
	firstName: z.string().nullable(),
	lastName: z.string().nullable(),
	email: z.string().nullable()
});
export type MobileAuthUserResponse = z.infer<typeof MobileAuthUserResponse>;

/** `{token, user}` — email is `null` for an Anonymous Account. */
export const MobileTokenResponse = z.object({
	token: z.string(),
	user: MobileAuthUserResponse
});
export type MobileTokenResponse = z.infer<typeof MobileTokenResponse>;

/**
 * Mobile signup's pending answer: the same shape for a created account and a
 * taken address, where `token` and `user.id` are `''` and nothing was created.
 */
export const MobileSignupResponse = z.object({
	token: z.string(),
	user: MobileAuthUserResponse.extend({ emailVerified: z.literal(false) }),
	emailVerification: z.literal('pending')
});
export type MobileSignupResponse = z.infer<typeof MobileSignupResponse>;

/** `{sent:true}` — claim request, mobile email, forgot-password. */
export const SentResponse = z.object({ sent: z.literal(true) });
export type SentResponse = z.infer<typeof SentResponse>;

/** `{success:true}` — mobile logout, verify, resend, reset. */
export const SuccessResponse = z.object({ success: z.literal(true) });
export type SuccessResponse = z.infer<typeof SuccessResponse>;

// --- `/api/me/*` ------------------------------------------------------------

/**
 * `POST /api/me/claim` `{email}`: a non-string reads `''`, then the rule trims
 * and lowercases before requiring a dot (`claimRequest.ts:56-58`). Format is
 * NOT a schema failure: a registered caller is refused before the address is
 * even read.
 */
export const ClaimRequestBody = z.object(
	{
		email: z.preprocess((value) => textOrEmpty(value).trim().toLowerCase(), z.string())
	},
	{ error: INVALID_JSON_MESSAGE }
);
export type ClaimRequestBody = z.infer<typeof ClaimRequestBody>;

/**
 * `POST /api/me/email` `{email}`: trimmed, never lowercased and never
 * format-checked beyond `includes('@')` (`accountData.ts:336-343`).
 */
export const ChangeEmailBody = z.object(
	{ email: z.preprocess((value) => textOrEmpty(value).trim(), z.string()) },
	{ error: INVALID_JSON_MESSAGE }
);
export type ChangeEmailBody = z.infer<typeof ChangeEmailBody>;

/** `POST /api/me/verify-email` `{code}`: trimmed; the address is the caller's own. */
export const VerifyEmailBody = z.object(
	{ code: trimmedField },
	{ error: INVALID_JSON_MESSAGE }
);
export type VerifyEmailBody = z.infer<typeof VerifyEmailBody>;

/**
 * `POST /api/me/verify-email/resend` reads no body at all (legacy never calls
 * `request.json()`), so there is deliberately no body schema: a S6 endpoint
 * must omit `body`, or a malformed body would gain a 400 the route never sent.
 */

/** `/api/me/email` success. */
export const ChangeEmailResponse = z.object({
	success: z.literal(true),
	message: z.literal(EMAIL_CHANGE_SENT_MESSAGE)
});
export type ChangeEmailResponse = z.infer<typeof ChangeEmailResponse>;

// --- `/api/mobile/auth/forgot` and `/reset` --------------------------------

/**
 * `POST /api/mobile/auth/forgot` `{email}`. Kept permissive on purpose: the
 * route's only check is truthiness (`forgot-password/+server.ts:50`), so
 * `'nope'` is a 200 `{sent:true}` — a kernel e-mail rule would change the wire.
 * A body the reader cannot parse is the house `Invalid JSON` (Q-062 B).
 */
export const ForgotPasswordBody = destructuredObject(
	{ email: z.preprocess(textOrEmpty, z.string()) },
	INVALID_JSON_MESSAGE
);
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBody>;

/**
 * `POST /api/mobile/auth/reset` `{token,password}`: no trimming, no length
 * rule here (the service maps `passwordResetRefusal`). A body the reader cannot
 * parse is the house `Invalid JSON` (Q-062 B).
 */
export const ResetPasswordBody = destructuredObject(
	{
		token: z.preprocess(textOrEmpty, z.string()),
		password: z.preprocess(textOrEmpty, z.string())
	},
	INVALID_JSON_MESSAGE
);
export type ResetPasswordBody = z.infer<typeof ResetPasswordBody>;

/** A reset refusal on the wire: every failure is `{error}` alone. */
export const WireErrorResponse = z.object({ error: z.string() });
export type WireErrorResponse = z.infer<typeof WireErrorResponse>;

/** `/api/me/email`'s guest refusal carries `guestNeedsClaim:true`. */
export const GuestClaimErrorResponse = WireErrorResponse.extend({
	guestNeedsClaim: z.literal(true)
});
export type GuestClaimErrorResponse = z.infer<typeof GuestClaimErrorResponse>;

/** The verify/resend/page-code refusals carry `{success:false,error}`. */
export const CodeErrorResponse = z.object({
	success: z.literal(false),
	error: z.string()
});
export type CodeErrorResponse = z.infer<typeof CodeErrorResponse>;

// --- Server-side row shapes -------------------------------------------------

/**
 * A Claim token's owner as the repo answers it: the row's user and address,
 * never the hash. Distinct from the wire — no route returns it.
 */
export type ClaimTokenOwner = {
	readonly userId: string;
	readonly email: string;
};
