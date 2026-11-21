/**
 * access email-link seam: ONE home for the magic part of every emailed sign-in
 * — the 8-digit code, the 15-minute HS256 link, the canonical message and the
 * kind-stamped code row. Sign-up and sign-in compose it; no route mints,
 * hashes or verifies a link or a code itself.
 *
 * Three legacy behaviours are kept on purpose:
 * - the gate runs BEFORE the existence check and exactly once. Suppressed
 *   addresses still consume their hit, so a burst on one address hits the same
 *   5 / 15 min bucket whether or not the address is known
 *   (`magicLink.ts:287-303`);
 * - the email is sent BEFORE the code row is written, so a failed send
 *   persists nothing (`magicLink.ts:235-258`);
 * - the code row's type is the link's kind, or `password-signup` for the
 *   code-only verification mail, so `/login` can never redeem a sign-up code
 *   (#154).
 *
 * Two decisions:
 * - the JWT is signed with `ctx.config.codePepper`, the one resolved
 *   `EMAILSECRET` value (the app resolves it fail-closed, Q-117). AppConfig
 *   carries no second name for that secret, and legacy signed links and hashed
 *   codes with the same environment value.
 * - `AppConfig` carries no site URL, so `baseUrl` is the caller's (S6 passes
 *   the request origin); `''` answers a path-only href. The old link was
 *   absolute because `getUrl()` read `NODE_ENV` at module scope (R6 forbids
 *   that here).
 *
 * The mail port answers no provider message id, so `codes.emailId` stays null
 * (legacy stored Resend's id there).
 *
 * Doc: ./README.md#invariants
 */
import { TimeSpan } from 'oslo';
import { createJWT, validateJWT } from 'oslo/jwt';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { invalid, tooMany } from '$lib/kernel/errors/appError';
import { isEmailAddress } from '$lib/kernel/validation/primitives';
import {
	findPersonForSignIn,
	issueEmailCode
} from '$lib/domains/identity/index.server';
import {
	EMAIL_CODE_LENGTH,
	magicLinkCallbackPath,
	magicLinkGateKey,
	readMagicLinkPayload,
	type MagicLinkKind,
	type MagicLinkReadResult
} from './access.email.rules';
import { authRedirectTarget } from './access.redirect.rules';

/** The link/code budget both kinds share: 5 emails per 15 minutes per address + IP. */
export const EMAIL_LINK_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 } as const;

/** The link's lifetime, the same 15 minutes the code row carries. */
const LINK_LIFETIME = new TimeSpan(15, 'm');

/** Legacy `magicLink.ts:137`: the subject is the same for both kinds. */
const LINK_EMAIL_SUBJECT = 'Family Planz Email Confirmation for ';

function linkEmailHtml(code: string, linkUrl: string): string {
	return `<h1>Here is the code to use for logging in: ${code}</h1>
			or if you would rather, here is a link for logging in: <a href="${linkUrl}"> link </a>
`;
}

// Password sign-up has no GET callback to land a clicked link on (its verify
// endpoint is POST-only), so its mail carries the code alone instead of a dead
// link (`passwordSignup.ts:118-122`).
function codeOnlyEmailHtml(code: string): string {
	return `<h1>Your Family Planz verification code is: ${code}</h1>
<p>Enter this code to verify your email. It expires in 15 minutes.</p>
`;
}

/** The per-route copy a shared start refuses with; the wire stays the route's. */
export type EmailLinkCopy = {
	readonly invalidEmail: string;
	readonly missingName: string;
	readonly rateLimited: string;
};

export type StartEmailLinkInput = {
	readonly kind: MagicLinkKind;
	readonly email: string;
	readonly firstName?: unknown;
	readonly lastName?: unknown;
	/** The raw `?redirect=`; sanitised here and dropped when unsafe (#284). */
	readonly redirectTo?: unknown;
	readonly clientIp: string;
	readonly baseUrl?: string;
	readonly copy: EmailLinkCopy;
};

export type SendResult =
	| { readonly sent: true }
	/** The provider refused the message: the caller answers its own 500 copy. */
	| { readonly sent: false; readonly reason: 'send-failed' };

type MintInput = {
	readonly email: string;
	readonly firstName?: string | null;
	readonly lastName?: string | null;
	/** The code row's type: the link kind, or `password-signup`. */
	readonly type: string;
	readonly callbackPath: string;
	readonly kind?: MagicLinkKind;
	readonly redirectTo?: string;
	readonly baseUrl?: string;
	readonly emailVariant?: 'link' | 'code-only';
};

/**
 * Mint the code + JWT, mail them, and only then persist the code row. The gate
 * is the caller's (it runs before the existence check). A provider refusal
 * answers `send-failed` and writes nothing.
 */
async function mintAndSend(ctx: Ctx, input: MintInput): Promise<SendResult> {
	let code = '';
	for (const byte of ctx.ids.random(EMAIL_CODE_LENGTH)) code += String(byte % 10);
	const token = await createJWT(
		'HS256',
		new TextEncoder().encode(ctx.config.codePepper),
		{
			...(input.kind !== undefined ? { kind: input.kind } : {}),
			email: input.email,
			firstName: input.firstName ?? undefined,
			lastName: input.lastName ?? undefined,
			code,
			...(input.redirectTo ? { redirectTo: input.redirectTo } : {})
		},
		{ headers: { alg: 'HS256', typ: 'JWT' }, expiresIn: LINK_LIFETIME }
	);

	const link = `${input.baseUrl ?? ''}${input.callbackPath}?token=${encodeURIComponent(token)}`;
	try {
		await ctx.mail.send({
			to: input.email,
			from: ctx.config.mailFrom,
			subject: `${LINK_EMAIL_SUBJECT}${input.email}`,
			html:
				input.emailVariant === 'code-only'
					? codeOnlyEmailHtml(code)
					: linkEmailHtml(code, link)
		});
	} catch (error) {
		// A log line is not the wire; the address is personal data, so it stays out.
		ctx.log.error('access_email_link_send_failed', {
			type: input.type,
			message: error instanceof Error ? error.message : String(error)
		});
		return { sent: false, reason: 'send-failed' };
	}

	await issueEmailCode(ctx, {
		code,
		email: input.email,
		type: input.type,
		firstName: input.firstName ?? null,
		lastName: input.lastName ?? null
	});
	return { sent: true };
}

/**
 * Issue one kind-tagged magic link: validate, gate (once, before the existence
 * check), suppress silently when the kind has nothing to send to, then mint,
 * mail and persist. A suppressed address still answered `{sent:true}`.
 */
export async function startEmailLink(
	ctx: Ctx,
	input: StartEmailLinkInput
): Promise<SendResult> {
	const firstName = typeof input.firstName === 'string' ? input.firstName : '';
	const lastName = typeof input.lastName === 'string' ? input.lastName : '';

	if (!isEmailAddress(input.email)) throw invalid(input.copy.invalidEmail);
	if (input.kind === 'signup' && (!firstName || !lastName)) {
		throw invalid(input.copy.missingName);
	}

	if (
		!ctx.limiter.allow(
			`${magicLinkGateKey(input.kind, input.email)}:${input.clientIp}`,
			EMAIL_LINK_LIMIT.limit,
			EMAIL_LINK_LIMIT.windowMs
		)
	) {
		throw tooMany(input.copy.rateLimited);
	}

	const lookup = await findPersonForSignIn(ctx, input.email);
	if (input.kind === 'signup') {
		// Legacy suppressed on an account row OR a user row (`magicLink.ts:293-297`).
		if (lookup.bound || lookup.person) return { sent: true };
	} else if (!lookup.person) {
		return { sent: true };
	}

	const names =
		input.kind === 'signup'
			? { firstName, lastName }
			: {
					firstName: lookup.person?.firstName ?? null,
					lastName: lookup.person?.lastName ?? null
				};

	return await mintAndSend(ctx, {
		email: input.email,
		...names,
		type: input.kind,
		kind: input.kind,
		callbackPath: magicLinkCallbackPath(input.kind),
		redirectTo: authRedirectTarget(input.redirectTo, ''),
		baseUrl: input.baseUrl
	});
}

export type SendSignupVerificationInput = {
	readonly email: string;
	readonly firstName?: string | null;
	readonly lastName?: string | null;
	readonly clientIp: string;
	readonly baseUrl?: string;
	readonly rateLimitedMessage: string;
	/** The verify page a code-only mail would land on (kept for parity with legacy). */
	readonly callbackPath: string;
};

/**
 * The code-only verification mail password sign-up and its resend share: the
 * same `pw-signup-code:<email>` 5 / 15 min bucket, no link to click, the code
 * row stamped `password-signup`.
 */
export async function sendSignupVerificationCode(
	ctx: Ctx,
	input: SendSignupVerificationInput
): Promise<SendResult> {
	if (
		!ctx.limiter.allow(
			`pw-signup-code:${input.email.toLowerCase()}:${input.clientIp}`,
			EMAIL_LINK_LIMIT.limit,
			EMAIL_LINK_LIMIT.windowMs
		)
	) {
		throw tooMany(input.rateLimitedMessage);
	}
	return await mintAndSend(ctx, {
		email: input.email,
		firstName: input.firstName ?? null,
		lastName: input.lastName ?? null,
		type: 'password-signup',
		callbackPath: input.callbackPath,
		emailVariant: 'code-only',
		baseUrl: input.baseUrl
	});
}

export type EmailLinkVerifyResult = MagicLinkReadResult;

/**
 * Verify one clicked link: signature + expiry, then the rules' kind-tagged
 * payload read (a signup link can never be consumed as a login link, and a
 * kind-less legacy token is a mismatch).
 */
export async function verifyEmailLinkToken(
	ctx: Ctx,
	token: string,
	kind: MagicLinkKind
): Promise<EmailLinkVerifyResult> {
	let payload: unknown;
	try {
		const jwt = await validateJWT(
			'HS256',
			new TextEncoder().encode(ctx.config.codePepper),
			token
		);
		payload = jwt.payload;
	} catch {
		// oslo throws a plain Error for an expired/forged/malformed token; the
		// legacy seam read a `code` it never set and answered the same generic
		// refusal either way.
		return { ok: false, reason: 'invalid' };
	}
	return readMagicLinkPayload(payload, kind);
}
