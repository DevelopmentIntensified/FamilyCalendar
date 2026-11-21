/**
 * access account: the signed-in account's own email work and its sign-out.
 *
 * Two flows, each ported from the route that owned it. (Verify-email and its
 * resend live in `access.signup.service.server.ts`, next to the sign-up they
 * mint the code for.)
 *
 * - **Email change** (`api/me/email` + the `/account/verify-email` page): the
 *   request is 3 / 15 min per person+IP, refuses an Anonymous Account with
 *   `guestNeedsClaim`, wants a different address that merely contains an `@`,
 *   then mails a 15-minute code+link to the NEW address while binding the row
 *   to the CURRENT one. Verification is 10 / 15 min per IP and needs a
 *   `email_change` row whose email is the caller's own (identity binding) plus
 *   an address still free.
 * - **Sign-out** (`api/logout` + `api/mobile/auth/logout`): the cookie session
 *   is ended, or exactly the presented `fp_` token is revoked — a mobile
 *   sign-out is not a web one and leaves the session row alone.
 *
 * Codes are identity's: `issueEmailCode` stores the keyed digest (Q-116/Q-117),
 * `findEmailCode` reads one without burning it, `redeemEmailCode` consumes it
 * (a row that expired on the way is deleted too), and `discardEmailCodes`
 * clears an address's pending codes. Nothing here logs a code or a token.
 *
 * Doc: ./README.md#invariants
 */
import { TimeSpan } from 'oslo';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { invalid, tooMany, unauthorized } from '$lib/kernel/errors/appError';
import {
	discardEmailCodes,
	endSession,
	findEmailCode,
	getPersonById,
	isApiTokenFormat,
	isEmailTaken,
	issueEmailCode,
	redeemEmailCode,
	revokeApiTokenByPlaintext,
	setPersonEmail
} from '$lib/domains/identity/index.server';
import {
	EMAIL_CHANGE_GUEST_MESSAGE,
	EMAIL_CHANGE_INVALID_MESSAGE,
	EMAIL_CHANGE_SAME_MESSAGE,
	EMAIL_CHANGE_SENT_MESSAGE,
	RATE_LIMIT_MESSAGE
} from './access.contract';
import { emailCodeExpiry, EMAIL_CODE_LENGTH } from './access.email.rules';
import { isRegisteredPerson } from './access.person.rules';
import { signEmailToken, verifyEmailToken } from './access.recovery.service.server';

// --- Rate limits (legacy keys and windows, each one bucket) -----------------

/** Email change: 3 / 15 min per person+IP (`accountData.ts:320-323`). */
export const EMAIL_CHANGE_LIMIT = 3;
export const EMAIL_CHANGE_WINDOW_MS = 15 * 60 * 1000;
/** Email-change verification: 10 / 15 min per IP (`account/verify-email/+page.server.ts:76-79`). */
export const EMAIL_CHANGE_VERIFY_LIMIT = 10;
export const EMAIL_CHANGE_VERIFY_WINDOW_MS = 15 * 60 * 1000;

/** The code kind this module issues and reads. */
const EMAIL_CHANGE_CODE_TYPE = 'email_change';
/** The email-change mail's own lifetime (`accountData.ts:373-378`). */
const EMAIL_CHANGE_CODE_TTL_MINUTES = 15;

/**
 * One 8-digit code from `ctx.ids.random` (`accountData.ts:342-352`). Bytes at or
 * above 250 are drawn again so each digit is uniform (the legacy generator's
 * rejection sampling); the tests' counting byte source winds up `01234567`.
 */
function nextEmailCode(ctx: Ctx): string {
	const bytes = ctx.ids.random(32);
	let code = '';
	let cursor = 0;
	while (code.length < EMAIL_CODE_LENGTH) {
		const byte = bytes[cursor % bytes.length] ?? 0;
		cursor += 1;
		if (byte < 250) code += String(byte % 10);
	}
	return code;
}

/** The email-change mail's subject (`accountData.ts:365`). */
const EMAIL_CHANGE_MAIL_SUBJECT = 'Family Planz Email Change Verification';
/** The email-change page a mailed link lands on (`accountData.ts:359-361`). */
const EMAIL_CHANGE_VERIFY_PATH = '/account/verify-email';

/**
 * The page-form copy the change/verify action answers. Not the `/api` wire, so
 * it stays local to the flow that says it (`account/verify-email/+page.server.ts`).
 */
const PAGE_COPY = {
	codeRequired: 'Verification code is required',
	tokenInvalid: 'Invalid or expired token',
	tokenMalformed: 'Invalid token',
	codeInvalid: 'Invalid verification code',
	codeExpired: 'Verification code has expired',
	noPendingEmail: 'No pending email found',
	emailInUse: 'That email is already in use'
} as const;

// --- Email change -----------------------------------------------------------

export type RequestEmailChangeInput = {
	/** The address as the body carried it (trimmed by the contract). */
	readonly email: string;
	/** `clientKeyOf(request, 'email-change:<person id>')` — person AND IP. */
	readonly clientKey: string;
	/** The site origin the mailed link points at. */
	readonly siteUrl: string;
};

/**
 * `POST /api/me/email`: mails a 15-minute code+link to the NEW address and
 * binds the stored row to the current one. A guest is refused with
 * `guestNeedsClaim`; both fields of the address form are checked in the
 * legacy order, with the legacy `includes('@')` rule.
 */
export async function requestEmailChange(
	ctx: Ctx,
	actor: Actor,
	input: RequestEmailChangeInput
): Promise<{ success: true; message: typeof EMAIL_CHANGE_SENT_MESSAGE }> {
	if (!ctx.limiter.allow(input.clientKey, EMAIL_CHANGE_LIMIT, EMAIL_CHANGE_WINDOW_MS)) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}

	const person = await getPersonById(ctx, actor.id);
	if (!person || !person.email || !isRegisteredPerson(person)) {
		throw invalid(EMAIL_CHANGE_GUEST_MESSAGE, { guestNeedsClaim: true });
	}
	const email = input.email.trim();
	if (!email || !email.includes('@')) throw invalid(EMAIL_CHANGE_INVALID_MESSAGE);
	if (email === person.email) throw invalid(EMAIL_CHANGE_SAME_MESSAGE);

	const code = nextEmailCode(ctx);
	const token = await signEmailToken(
		ctx,
		{ code, pendingEmail: email },
		new TimeSpan(EMAIL_CHANGE_CODE_TTL_MINUTES, 'm')
	);
	const verifyUrl = new URL(input.siteUrl);
	verifyUrl.pathname = EMAIL_CHANGE_VERIFY_PATH;
	verifyUrl.searchParams.set('token', token);

	await ctx.mail.send({
		to: email,
		from: ctx.config.mailFrom,
		subject: EMAIL_CHANGE_MAIL_SUBJECT,
		html: `<h1>Your verification code is: ${code}</h1>
<p>Or click this link to verify: <a href="${verifyUrl.toString()}">Verify Email</a></p>`
	});
	// A new request replaces the address's pending codes (legacy `deleteCodesByEmail`).
	await discardEmailCodes(ctx, person.email);
	await issueEmailCode(ctx, {
		code,
		email: person.email,
		type: EMAIL_CHANGE_CODE_TYPE,
		firstName: person.firstName,
		lastName: person.lastName,
		pendingEmail: email,
		expiresAt: emailCodeExpiry(ctx.clock.now())
	});
	return { success: true, message: EMAIL_CHANGE_SENT_MESSAGE };
}

export type VerifyEmailChangeInput = {
	/** The link token, when the caller came from the mail's button. */
	readonly token?: string | null;
	/** The 8-digit code, when the caller typed it in. */
	readonly code?: string | null;
	/** `clientKeyOf(request, 'verify-email-change')` — the caller builds it. */
	readonly clientKey: string;
};

/**
 * The `/account/verify-email` action: the token path or the code path, both
 * bound to the caller's own address, both single-use, both refused when the
 * pending address has since been taken.
 */
export async function verifyEmailChange(
	ctx: Ctx,
	actor: Actor,
	input: VerifyEmailChangeInput
): Promise<{ success: true; message: string }> {
	if (
		!ctx.limiter.allow(
			input.clientKey,
			EMAIL_CHANGE_VERIFY_LIMIT,
			EMAIL_CHANGE_VERIFY_WINDOW_MS
		)
	) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}
	const token = (input.token ?? '').trim();
	const code = (input.code ?? '').trim();
	if (!token && !code) throw invalid(PAGE_COPY.codeRequired);

	const person = await getPersonById(ctx, actor.id);
	const currentEmail =
		person && person.email && isRegisteredPerson(person) ? person.email : '';
	let pendingEmail: string;

	if (token) {
		const verified = await verifyEmailToken(ctx, token);
		if (!verified) throw invalid(PAGE_COPY.tokenInvalid);
		const payload = verified.payload;
		if (
			typeof payload !== 'object' ||
			payload === null ||
			!('code' in payload) ||
			typeof payload.code !== 'string' ||
			!('pendingEmail' in payload) ||
			typeof payload.pendingEmail !== 'string'
		) {
			throw invalid(PAGE_COPY.tokenMalformed);
		}
		pendingEmail = payload.pendingEmail;
		const row = currentEmail
			? await findEmailCode(ctx, {
					code: payload.code,
					email: currentEmail,
					type: EMAIL_CHANGE_CODE_TYPE
				})
			: null;
		if (!row || row.expiresAt.getTime() < ctx.clock.now().getTime()) {
			throw invalid(PAGE_COPY.tokenInvalid);
		}
		if (row.pendingEmail !== pendingEmail) throw invalid(PAGE_COPY.tokenInvalid);
		if (await isEmailTaken(ctx, pendingEmail)) throw invalid(PAGE_COPY.emailInUse);
		// The write first, the burn second: a failed write leaves the code usable,
		// exactly like the legacy action.
		await setPersonEmail(ctx, actor, { email: pendingEmail });
		await redeemEmailCode(ctx, {
			code: payload.code,
			email: currentEmail,
			type: EMAIL_CHANGE_CODE_TYPE
		});
	} else {
		const row = currentEmail
			? await findEmailCode(ctx, { code, email: currentEmail, type: EMAIL_CHANGE_CODE_TYPE })
			: null;
		if (!row) throw invalid(PAGE_COPY.codeInvalid);
		if (row.expiresAt.getTime() < ctx.clock.now().getTime()) {
			throw invalid(PAGE_COPY.codeExpired);
		}
		if (!row.pendingEmail) throw invalid(PAGE_COPY.noPendingEmail);
		pendingEmail = row.pendingEmail;
		if (await isEmailTaken(ctx, pendingEmail)) throw invalid(PAGE_COPY.emailInUse);
		await setPersonEmail(ctx, actor, { email: pendingEmail });
		await redeemEmailCode(ctx, { code, email: currentEmail, type: EMAIL_CHANGE_CODE_TYPE });
	}

	return { success: true, message: 'Email verified successfully!' };
}

// --- Sign-out ---------------------------------------------------------------

export type SignOutInput = {
	/** The cookie session to end, when the caller arrived on one. */
	readonly sessionId?: string | null;
	/** The exact `fp_` plaintext to revoke, when the caller arrived on a Bearer. */
	readonly token?: string | null;
};

/**
 * `POST /api/logout` and `POST /api/mobile/auth/logout`: a Bearer caller
 * revokes exactly the presented token and touches no session; a cookie caller
 * ends its own session. Idempotent either way.
 */
export async function signOut(
	ctx: Ctx,
	actor: Actor,
	input: SignOutInput
): Promise<{ success: true }> {
	if (input.token) {
		// The mobile door accepts only its own `fp_` bearer; a web caller never
		// presents a token, so this refusal cannot reach `/api/logout`.
		if (!isApiTokenFormat(input.token)) throw unauthorized();
		await revokeApiTokenByPlaintext(ctx, actor.id, input.token);
		return { success: true };
	}
	if (input.sessionId) await endSession(ctx, input.sessionId);
	return { success: true };
}
