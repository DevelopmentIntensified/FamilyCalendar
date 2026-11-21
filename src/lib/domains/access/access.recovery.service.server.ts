/**
 * access recovery: the forgot-password mail and the reset it leads to.
 *
 * Ported from `forgot-password/+server.ts` and `forgot-password/reset/+server.ts`
 * (the mobile wrappers `api/mobile/auth/forgot` and `/reset` are thin over
 * them). The rules are the legacy ones, in this order:
 *
 * - Forgot: `!email` is the only input check (no format rule, no case folding),
 *   then 5 sends / 15 min per `reset:<address>` + IP, then the lookup. An
 *   unknown or Anonymous Account address gets the same `{sent:true}` a real
 *   send returns — no enumeration oracle (#245).
 * - Reset: both fields, then the ≥8 length, then the HS256 signature, then the
 *   `email` claim, then the durable `used:<sha256(token)>` marker (a used link
 *   stays used until the token expires), then the account, then the marker
 *   write, the new hash, and "log out everywhere" (every session and every
 *   `fp_` token).
 *
 * The signed-token seam is here because recovery is the flow that mints and
 * verifies the reset JWT; the email-change service reuses the two helpers. The
 * key is `ctx.config.codePepper`, the one server value `EMAILSECRET` supplies
 * (R6: no module reads `$env`), and a link's site origin is passed in by the
 * caller (`getUrl()` is the app's to read).
 *
 * Every marker storage detail is identity's: `issueEmailCode` hashes the
 * marker with the pepper (Q-116/Q-117), `findEmailCode` reads it without
 * burning it, and `markerFor` is the only place the plaintext marker exists.
 *
 * Doc: ./README.md#invariants
 */
import { TimeSpan } from 'oslo';
import { createJWT, parseJWT, validateJWT } from 'oslo/jwt';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { invalid, tooMany } from '$lib/kernel/errors/appError';
import { sha256Hex } from '$lib/kernel/ids/ids';
import {
	endAllSessions,
	findEmailCode,
	getPersonByEmail,
	issueEmailCode,
	revokeAllApiTokens,
	setPersonPassword
} from '$lib/domains/identity/index.server';
import {
	FORGOT_EMAIL_REQUIRED_MESSAGE,
	PASSWORD_TOO_SHORT_MESSAGE,
	RATE_LIMIT_MESSAGE,
	RESET_ACCOUNT_NOT_FOUND_MESSAGE,
	RESET_FIELDS_REQUIRED_MESSAGE,
	RESET_INVALID_PAYLOAD_MESSAGE,
	RESET_INVALID_TOKEN_MESSAGE,
	RESET_USED_MESSAGE
} from './access.contract';
import { readResetTokenPayload, resetTokenExpiry, RESET_LINK_TTL_MS } from './access.email.rules';
import { passwordResetRefusal, resetUsedMarker } from './access.password.rules';
import { isRegisteredPerson } from './access.person.rules';

/** 5 reset mails per address + IP inside 15 minutes (`forgot-password/+server.ts:54`). */
export const RESET_REQUEST_LIMIT = 5;
export const RESET_REQUEST_WINDOW_MS = 15 * 60 * 1000;

/** The marker's kind: its own `codes.type`, so no sign-in code can stand in for it. */
const RESET_MARKER_TYPE = 'reset_used';

/** The reset mail's copy, legacy verbatim. */
const RESET_MAIL_SUBJECT = 'Family Planz Password Reset';

/** The reset page a mailed link lands on (`forgot-password/+server.ts:66-68`). */
const RESET_LINK_PATH = '/forgot-password/reset';

// --- The signed-token seam --------------------------------------------------

/** A JWT whose signature and expiry both held. */
export type VerifiedEmailToken = {
	readonly payload: unknown;
	readonly expiresAt: Date | null;
};

/**
 * Mints one HS256 JWT with the server's one e-mail secret. `lifetime` is the
 * flow's own (60 min for a reset link, 15 for a code).
 */
export async function signEmailToken(
	ctx: Ctx,
	payload: Record<string, unknown>,
	lifetime: TimeSpan
): Promise<string> {
	return await createJWT('HS256', new TextEncoder().encode(ctx.config.codePepper), payload, {
		headers: { alg: 'HS256', typ: 'JWT' },
		expiresIn: lifetime
	});
}

/**
 * The signature and the expiry, nothing else: a token that fails either reads
 * `null`, and the payload stays untrusted (each flow reads it through its own
 * rules function).
 */
export async function verifyEmailToken(
	ctx: Ctx,
	token: string
): Promise<VerifiedEmailToken | null> {
	const key = new TextEncoder().encode(ctx.config.codePepper);
	try {
		await validateJWT('HS256', key, token);
	} catch {
		return null;
	}
	const parsed = parseJWT(token);
	if (!parsed) return null;
	return { payload: parsed.payload, expiresAt: parsed.expiresAt };
}

/** The reset page URL a forgot-password send carries. */
export function resetLinkUrl(siteUrl: string, token: string): string {
	const url = new URL(siteUrl);
	url.pathname = RESET_LINK_PATH;
	url.searchParams.set('token', token);
	return url.toString();
}

export type RequestPasswordResetInput = {
	/** The address as the body carried it; only truthiness is checked. */
	readonly email: string;
	/** `clientKeyOf(request, 'reset:<address lowercased>')` — the caller builds it. */
	readonly clientKey: string;
	/** The site origin the mailed link points at (`getUrl()`, read by the app). */
	readonly siteUrl: string;
};

/**
 * `POST /api/mobile/auth/forgot` (and the web page's action): mails a
 * 60-minute reset link to a registered address and answers `{sent:true}` for
 * everyone else. The send's failure is a fault (the route's 500
 * `Failed to send reset email`).
 */
export async function requestPasswordReset(
	ctx: Ctx,
	input: RequestPasswordResetInput
): Promise<{ sent: true }> {
	if (!input.email) throw invalid(FORGOT_EMAIL_REQUIRED_MESSAGE);
	if (!ctx.limiter.allow(input.clientKey, RESET_REQUEST_LIMIT, RESET_REQUEST_WINDOW_MS)) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}

	const person = await getPersonByEmail(ctx, input.email);
	if (!isRegisteredPerson(person)) return { sent: true };

	const token = await signEmailToken(
		ctx,
		{ email: input.email },
		new TimeSpan(RESET_LINK_TTL_MS / 60_000, 'm')
	);
	await ctx.mail.send({
		to: input.email,
		from: ctx.config.mailFrom,
		subject: RESET_MAIL_SUBJECT,
		html: `<h1>Password Reset</h1>
				<p>Click the link below to reset your password. This link expires in 60 minutes.</p>
				<a href="${resetLinkUrl(input.siteUrl, token)}">Reset Password</a>`
	});
	return { sent: true };
}

export type ResetPasswordInput = {
	readonly token: string;
	readonly password: string;
};

/**
 * `POST /api/mobile/auth/reset`: single-use, and a success ends every session
 * and every `fp_` token the account holds. The IP throttle the mobile wrapper
 * adds stays in that wrapper (Q-066: one limiter, moved here after S6) so this
 * service does not spend a second bucket.
 */
export async function resetPassword(
	ctx: Ctx,
	input: ResetPasswordInput
): Promise<{ success: true }> {
	const refusal = passwordResetRefusal(input);
	if (refusal === 'missing-fields') throw invalid(RESET_FIELDS_REQUIRED_MESSAGE);
	if (refusal === 'short-password') throw invalid(PASSWORD_TOO_SHORT_MESSAGE);

	const verified = await verifyEmailToken(ctx, input.token);
	if (!verified) throw invalid(RESET_INVALID_TOKEN_MESSAGE);
	const payload = readResetTokenPayload(verified.payload);
	if (!payload) throw invalid(RESET_INVALID_PAYLOAD_MESSAGE);

	const marker = resetUsedMarker(sha256Hex(input.token));
	const used = await findEmailCode(ctx, {
		code: marker,
		email: payload.email,
		type: RESET_MARKER_TYPE
	});
	if (used) throw invalid(RESET_USED_MESSAGE);

	const person = await getPersonByEmail(ctx, payload.email);
	if (!person) throw invalid(RESET_ACCOUNT_NOT_FOUND_MESSAGE);

	// The marker outlives this request and expires with the token it marks.
	await issueEmailCode(ctx, {
		code: marker,
		email: payload.email,
		type: RESET_MARKER_TYPE,
		expiresAt: verified.expiresAt ?? resetTokenExpiry(ctx.clock.now())
	});

	await setPersonPassword(ctx, person.id, { password: input.password });
	await signOutEverywhere(ctx, person.id);
	return { success: true };
}

/**
 * The "credentials changed" pair: every browser session and every `fp_` token
 * of one person. Reset calls it after rehashing; a future "sign out
 * everywhere" door calls the same two identity use-cases.
 */
export async function signOutEverywhere(ctx: Ctx, personId: string): Promise<void> {
	await endAllSessions(ctx, personId);
	await revokeAllApiTokens(ctx, personId);
}
