import { sendEmail } from '$lib/utils/sendEmail';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT, validateJWT } from 'oslo/jwt';
import { TimeSpan } from 'oslo';
import { generateRandomString, type RandomReader } from '@oslojs/crypto/random';
import { createCode } from '$lib/server/db/actions/codes';
import { getAccount } from '$lib/server/db/actions/accounts';
import { getUser, getUserByEmail } from '$lib/server/db/actions/users';
import { session, type SessionCookie } from '$lib/server/auth';

/**
 * Single source of truth for the magic-link lifecycle (email → code + JWT link
 * → callback consumption). Both signup and login routes delegate here; the
 * claim flow shares the email send (canonical from-address) and the session
 * cookie assembly, while its token storage stays in `claimService`.
 *
 * Email/token shape (unified, previously drifted between routes):
 * - sender is always `NOREPLYEMAIL`
 * - copy says "logging in" (was "loggin in" in both copies)
 * - JWT payload is kind-tagged so a signup link can never be consumed as a
 *   login link (or vice versa)
 */

export type MagicLinkKind = 'signup' | 'login' | 'claim';

/** Kinds the module mints code+JWT links for. `claim` keeps its own token
 *  lifecycle (DB-hashed random token in claimService) and only reuses the
 *  email send via `sendClaimLinkEmail`. */
export type MagicLinkTokenKind = Exclude<MagicLinkKind, 'claim'>;

/** Rate limit shared by every magic-link email endpoint. */
export const MAGIC_LINK_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 } as const;

export type MagicLinkPayload = {
	kind: MagicLinkTokenKind;
	email: string;
	firstName?: string | null;
	lastName?: string | null;
	code: string;
};

/**
 * Collaborators of the magic-link lifecycle, injectable so tests can pass
 * fakes through a real seam instead of mocking modules. Defaults wire the
 * production services.
 */
export type MagicLinkDeps = {
	// db lookups/writes
	getAccount: typeof getAccount;
	getUser: typeof getUser;
	getUserByEmail: typeof getUserByEmail;
	createCode: typeof createCode;
	// email
	sendEmail: typeof sendEmail;
	fromEmail: string;
	// jwt
	createJwt: typeof createJWT;
	verifyJwt: typeof validateJWT;
	jwtSecret: Uint8Array;
	// misc
	baseSiteUrl: string;
	session: Pick<typeof session, 'createSession' | 'createSessionCookie'>;
};

const randomReader: RandomReader = {
	read(bytes) {
		crypto.getRandomValues(bytes);
	}
};

export const magicLinkDeps: MagicLinkDeps = {
	getAccount,
	getUser,
	getUserByEmail,
	createCode,
	sendEmail,
	fromEmail: NOREPLYEMAIL,
	createJwt: createJWT,
	verifyJwt: validateJWT,
	jwtSecret: new TextEncoder().encode(EMAILSECRET),
	baseSiteUrl: getUrl(),
	session
};

const EMAIL_REGEX =
	/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/** Route-supplied per-request rate limiter: receives the scope+email bucket
 *  key, decides whether the request may proceed. */
export type MagicLinkGate = (key: string) => boolean;

export type IssueMagicLinkResult =
	| { status: 'sent'; code: string }
	/** Email is already registered (signup) or unknown (login) — send nothing,
	 *  the caller responds with the same shape as the happy path. */
	| { status: 'suppressed' }
	| {
			status: 'rejected';
			reason: 'invalid-email' | 'missing-name' | 'rate-limited' | 'send-failed';
	  };

export type IssueMagicLinkInput = {
	email: string;
	firstName?: string;
	lastName?: string;
};

function rateLimitKey(kind: MagicLinkTokenKind, email: string): string {
	const scope = kind === 'signup' ? 'signup-code' : 'login-code';
	return `${scope}:${email.toLowerCase()}`;
}

/** Named contract for the names persisted alongside the code. */
type MagicLinkCodeNames = {
	firstName?: string | null;
	lastName?: string | null;
};

const LINK_EMAIL_SUBJECT = 'Family Planz Email Confirmation for ';

function linkEmailHtml(code: string, linkUrl: string): string {
	return `<h1>Here is the code to use for logging in: ${code}</h1>
			or if you would rather, here is a link for logging in: <a href="${linkUrl}"> link </a>
`;
}

// Password signup has no GET callback to land a clicked link on (the verify
// endpoint is POST-only by design — codes, not tokens), so its email carries
// the code alone instead of a dead link. Magic-link keeps the link: its
// callbacks consume the JWT.
function codeOnlyEmailHtml(code: string): string {
	return `<h1>Your Family Planz verification code is: ${code}</h1>
<p>Enter this code to verify your email. It expires in 15 minutes.</p>
`;
}

export type IssueVerificationCodeInput = {
	email: string;
	firstName?: string | null;
	lastName?: string | null;
};

export type IssueVerificationCodeOpts = {
	/** Where the emailed link points, e.g. `/signup/email/callback`. Required:
	 *  the seam is kind-agnostic so there is no sensible default. */
	callbackPath: string;
	/** Bucket key the gate checks, e.g. `signup-code:user@example.com`. */
	gateKey: string;
	/** Opaque JWT claim passthrough: the seam never branches on it, but the
	 *  legacy kind-tagged wrapper supplies it to keep its wire shape (and
	 *  `consumeMagicLink` compatibility). Omit for kind-less tokens. */
	kind?: MagicLinkTokenKind;
	/** Code-only email (no clickable link): for flows with no GET callback
	 *  to land the link on. Defaults to the link email. */
	emailVariant?: 'link' | 'code-only';
};
export type IssueVerificationCodeResult =
	| { status: 'sent'; code: string }
	| { status: 'rejected'; reason: 'rate-limited' | 'send-failed' };

/**
 * Kind-agnostic verification-code seam: applies the caller's gate, mints an
 * 8-digit code plus a 15-minute JWT, sends the code+link email from the
 * canonical address and persists the code. No email validation, no
 * kind-specific rules, no account/existence suppression, no name
 * requirements — the caller owns all of that and supplies whatever names it
 * has.
 */
export async function issueVerificationCode(
	deps: Pick<
		MagicLinkDeps,
		'createCode' | 'sendEmail' | 'fromEmail' | 'createJwt' | 'jwtSecret' | 'baseSiteUrl'
	>,
	input: IssueVerificationCodeInput,
	gate: MagicLinkGate,
	opts: IssueVerificationCodeOpts
): Promise<IssueVerificationCodeResult> {
	const { email, firstName, lastName } = input;

	if (!gate(opts.gateKey)) {
		return { status: 'rejected', reason: 'rate-limited' };
	}

	const code = generateRandomString(randomReader, '0123456789', 8);

	const token = await deps.createJwt(
		'HS256',
		deps.jwtSecret,
		{
			...(opts.kind !== undefined ? { kind: opts.kind } : {}),
			email,
			firstName,
			lastName,
			code
		},
		{
			headers: {
				alg: 'HS256',
				typ: 'JWT'
			},
			expiresIn: new TimeSpan(15, 'm')
		}
	);

	const callbackUrl = new URL(deps.baseSiteUrl);
	callbackUrl.pathname = opts.callbackPath;
	callbackUrl.searchParams.set('token', token);

	const html =
		opts.emailVariant === 'code-only'
			? codeOnlyEmailHtml(code)
			: linkEmailHtml(code, callbackUrl.toString());
	const { success, data } = await deps.sendEmail({
		to: email,
		from: deps.fromEmail,
		subject: LINK_EMAIL_SUBJECT + email,
		html
	});

	if (!success) {
		return { status: 'rejected', reason: 'send-failed' };
	}

	await deps.createCode({
		code,
		expiresAt: new Date(Date.now() + 60 * 1000 * 15),
		email,
		firstName,
		lastName,
		emailId: data?.id || null
	});

	return { status: 'sent', code };
}

/**
 * Issues a magic link for `kind`: validates input, suppresses for
 * known/unknown emails, then delegates the gated mint + send + persist to
 * `issueVerificationCode` (passing `kind` through for the JWT claim and the
 * callback path). The route only maps the result to its HTTP response.
 */
export async function issueMagicLink(
	deps: MagicLinkDeps,
	kind: MagicLinkTokenKind,
	input: IssueMagicLinkInput,
	gate: MagicLinkGate
): Promise<IssueMagicLinkResult> {
	const { email, firstName, lastName } = input;

	if (!email || !EMAIL_REGEX.test(email)) {
		return { status: 'rejected', reason: 'invalid-email' };
	}

	if (kind === 'signup' && (!firstName || !lastName || firstName === '' || lastName === '')) {
		return { status: 'rejected', reason: 'missing-name' };
	}
	const gateKey = rateLimitKey(kind, email);
	if (!gate(gateKey)) {
		return { status: 'rejected', reason: 'rate-limited' };
	}

	let codeNames: MagicLinkCodeNames;
	if (kind === 'signup') {
		const account = await deps.getAccount(email);
		const existingUser = await deps.getUserByEmail(email);
		if (account || existingUser) return { status: 'suppressed' };
		codeNames = { firstName, lastName };
	} else {
		const account = await deps.getAccount(email);
		const user = account ? await deps.getUser(account.userId) : await deps.getUserByEmail(email);
		if (!user) return { status: 'suppressed' };
		codeNames = { firstName: user.firstName, lastName: user.lastName };
	}

	// The gate already ran above with this same key (it must run before
	// suppression, and the limiter is stateful so it must run exactly
	// once). The seam's gate is trivially satisfied here.
	return issueVerificationCode(
		deps,
		{ email, firstName: codeNames.firstName, lastName: codeNames.lastName },
		() => true,
		{ callbackPath: `/${kind}/email/callback`, gateKey, kind }
	);
}

export type ConsumeMagicLinkResult =
	| { ok: true; payload: MagicLinkPayload }
	| { ok: false; reason: 'expired' | 'invalid' | 'kind-mismatch' };

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- boundary bag: the JWT payload is untrusted input; every field is read through the validators below.
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/** Boundary parse of the JWT payload: even though it is signed it is still
 *  input, so every field the lifecycle relies on is validated here.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- JWT payload is untrusted boundary input; this function IS the parser.
function parseMagicPayload(payload: unknown): {
	kind: MagicLinkTokenKind;
	email: string;
	code: string;
	firstName: unknown;
	lastName: unknown;
} | null {
	if (!isRecord(payload)) return null;
	if (payload.kind !== 'signup' && payload.kind !== 'login') return null;
	if (!isNonEmptyString(payload.email) || !isNonEmptyString(payload.code)) return null;
	return {
		kind: payload.kind,
		email: payload.email,
		code: payload.code,
		firstName: payload.firstName,
		lastName: payload.lastName
	};
}

/**
 * Verifies a magic-link JWT for `kind`: single source for signature/expiry
 * checking, kind-tag matching and payload validation. How the route reacts to
 * each failure (redirects, error params) stays in the route.
 */
export async function consumeMagicLink(
	deps: MagicLinkDeps,
	token: string,
	kind: MagicLinkTokenKind
): Promise<ConsumeMagicLinkResult> {
	let payload: unknown;
	try {
		const jwt = await deps.verifyJwt('HS256', deps.jwtSecret, token);
		payload = jwt.payload;
	} catch (e) {
		// SAFETY: oslo JWT errors carry a `code` string; anything else is treated
		// as a generic invalid token.
		const expired = (e as { code?: string } | null)?.code === 'JWT_EXPIRED';
		return { ok: false, reason: expired ? 'expired' : 'invalid' };
	}

	if (!isRecord(payload)) {
		return { ok: false, reason: 'invalid' };
	}

	// A payload without the kind tag predates the unified lifecycle.
	if (!('kind' in payload)) {
		return { ok: false, reason: 'kind-mismatch' };
	}

	const parsed = parseMagicPayload(payload);
	if (!parsed) {
		return { ok: false, reason: 'invalid' };
	}

	if (parsed.kind !== kind) {
		return { ok: false, reason: 'kind-mismatch' };
	}

	if (
		kind === 'signup' &&
		(!isNonEmptyString(parsed.firstName) || !isNonEmptyString(parsed.lastName))
	) {
		return { ok: false, reason: 'invalid' };
	}

	// SAFETY: parseMagicPayload validated kind/email/code above, and the
	// signup-kind names passed isNonEmptyString immediately before — the
	// assertion restores the payload contract for the caller.
	const magicPayload = parsed as MagicLinkPayload;

	return { ok: true, payload: magicPayload };
}

/**
 * Session assembly shared by the signup/login callbacks and the claim-verify
 * endpoint: creates the Lucia session for `userId` and returns its id plus the
 * session cookie (which also `.serialize()`s for a raw Set-Cookie header).
 */
/**
 * Session assembly shared by the signup/login callbacks and the claim-verify
 * endpoint: creates the session for `userId` and returns its id plus the
 * session cookie (which also `.serialize()`s for a raw Set-Cookie header).
 */
export async function sessionCookieFor(
	deps: Pick<MagicLinkDeps, 'session'>,
	userId: string
): Promise<{ sessionId: string; cookie: SessionCookie }> {
	const sessionRow = await deps.session.createSession(userId);
	const cookie = await deps.session.createSessionCookie(sessionRow);
	return { sessionId: sessionRow.id, cookie };
}

const CLAIM_MERGE_HTML = (verifyUrl: string) =>
	`<p>This email already has a Family Planz account. Clicking the link below will bring the calendar you've added on this device into that existing account, so you can keep using it from anywhere.</p><p><a href="${verifyUrl}">Merge my calendar into my account</a></p><p>If you didn't expect this, you can safely ignore this email. The link expires in 15 minutes.</p>`;

const CLAIM_SAVE_HTML = (verifyUrl: string) =>
	`<p>Click the link below to add this email to your Family Planz account and sync your calendar across devices:</p><p><a href="${verifyUrl}">Save my calendar</a></p><p>This link expires in 15 minutes.</p>`;

export type SendClaimLinkEmailInput = {
	email: string;
	verifyUrl: string;
	alreadyRegistered: boolean;
};

export type SendClaimLinkEmailResult = { ok: true } | { ok: false; reason: 'send-failed' };

/**
 * Claim-flow email send: same lifecycle seam (canonical from-address, shared
 * sendEmail dep) as the signup/login link emails. Token issuance stays in
 * `claimService`; the caller supplies the verify URL.
 */
export async function sendClaimLinkEmail(
	deps: Pick<MagicLinkDeps, 'sendEmail' | 'fromEmail'>,
	input: SendClaimLinkEmailInput
): Promise<SendClaimLinkEmailResult> {
	try {
		const { success } = await deps.sendEmail({
			to: input.email,
			from: deps.fromEmail,
			subject: input.alreadyRegistered
				? 'Merge your calendar into your Family Planz account'
				: 'Save your Family Planz calendar',
			html: input.alreadyRegistered
				? CLAIM_MERGE_HTML(input.verifyUrl)
				: CLAIM_SAVE_HTML(input.verifyUrl)
		});
		return success ? { ok: true } : { ok: false, reason: 'send-failed' };
	} catch {
		return { ok: false, reason: 'send-failed' };
	}
}
