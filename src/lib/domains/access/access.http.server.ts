/**
 * access http: every `/api` handler of the module, plus the two page-group
 * JSON endpoints (`/login/email` and its twins) the auth screens fetch.
 *
 * Route files stay wiring-only (`export const POST = mobileVerifyEndpoint.handler`).
 * Statuses, bodies, envelopes, redirects and cookies are the legacy wire,
 * pinned by `access.http.db.test.ts`; the services own every rule and the
 * contract owns every sentence. Nothing here reads the clock, the environment
 * or SQL (R5/R6): the client address comes from the request headers, the site
 * origin from `ctx.config.siteUrl`, and every refusal an `AppError`.
 *
 * Three boundary details the golden pins, each kept exactly:
 * - the mobile routes read their body through `access.contract`'s schemas, so a
 *   malformed body is their own `Request body must be JSON` sentence, an empty
 *   body is refused the same way (`'lenient'`), and only the guest door treats
 *   a missing body as `{}` (`'empty-object'`);
 * - `forgot` and `reset` answer the house `400 {"error":"Invalid JSON"}` for a
 *   body they cannot read (Q-062 B, `'strict'`): the legacy handlers parsed
 *   inside their own `try`, and the 500 send copy they answered then is gone;
 * - the two page-code endpoints answer `{success:false,error}` — never the
 *   house `{error}` — because the sign-in screens read that envelope, and both
 *   say the one generic `Unexpected error, please try again` (Q-064 B).
 *
 * The web-forwarded routes (`/login/*`, `/signup/*`, `/forgot-password*`) keep
 * their `{success:false,error}` envelopes where legacy did and answer the house
 * `400 {"error":"Invalid JSON"}` for a body legacy could not parse at all (its
 * unguarded `request.json()` surfaced as a framework 500; the sheet files that
 * as accidental, and Q-062's answer is the house 400).
 *
 * Doc: ./README.md#public-interface
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { isAppError } from '$lib/kernel/errors/appError';
import { endpoint, ok, reply } from '$lib/kernel/http/endpoint.server';
import { clientKeyOf } from '$lib/kernel/ratelimit/rateLimiter';
import type { JsonValue } from '$lib/kernel/validation/validators';
import { blankSessionCookie, type SessionCookie } from '$lib/domains/identity/index.server';
import {
	CLAIM_SEND_FAILED_MESSAGE,
	ChangeEmailBody,
	ClaimRequestBody,
	EMAIL_CHANGE_SEND_FAILED_MESSAGE,
	FORGOT_SEND_FAILED_MESSAGE,
	ForgotPasswordBody,
	LOGOUT_REDIRECT_PATH,
	MOBILE_ACCOUNT_EXISTS_MESSAGE,
	MOBILE_SEND_FAILED_MESSAGE,
	MOBILE_SERVER_ERROR_MESSAGE,
	MOBILE_WRONG_CODE_MESSAGE,
	MobileEmailBody,
	MobileGuestBody,
	MobilePasswordBody,
	MobileSignupBody,
	MobileVerifyBody,
	RESEND_FAILED_MESSAGE,
	RESET_FAILED_MESSAGE,
	ResetPasswordBody,
	UNAUTHORIZED_MESSAGE,
	VERIFY_GENERIC_ERROR_MESSAGE,
	VerifyEmailBody
} from './access.contract';
import { toMobileUser } from './access.device.rules';
import {
	completeEmailLoginCode,
	createMobileGuest,
	requestMobileEmailCode,
	signInMobileWithPassword,
	signInWithPassword,
	startEmailLogin,
	verifyMobileEmailCode
} from './access.login.service.server';
import type { SendResult } from './access.emailLink.service.server';
import {
	completeEmailSignupCode,
	resendSignupCode,
	signUpMobileWithPassword,
	signUpWebWithPassword,
	startEmailSignup,
	verifySignupCode
} from './access.signup.service.server';
import { requestClaim } from './access.claim.service.server';
import { requestEmailChange, signOut } from './access.account.service.server';
import { stashGuestFromCookies } from './access.guestMerge.service.server';
import {
	requestPasswordReset,
	RESET_ATTEMPT_SCOPE,
	resetPassword
} from './access.recovery.service.server';

// --- Boundary helpers -------------------------------------------------------

/**
 * The client address every limiter keys on: `x-real-ip`, else the first
 * `x-forwarded-for` hop, else `local` — the legacy `clientKey` read
 * (`rateLimit.ts:20-26`), folded into the scope by `clientKeyOf`.
 */
function clientIpOf(request: Request): string {
	const forwarded = request.headers.get('x-forwarded-for');
	const real = request.headers.get('x-real-ip');
	return (real ?? forwarded?.split(',')[0] ?? 'local').trim() || 'local';
}

/** The presented `Authorization: Bearer …` value, or `''` when there is none. */
function bearerTokenOf(request: Request): string {
	const header = request.headers.get('authorization') ?? '';
	return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
}

/**
 * The `Set-Cookie` header for a JSON or redirect response that cannot use
 * kit's cookie API (the code and password sign-ins, the email-link callbacks):
 * same attributes identity's session cookie carries, encoded once.
 */
export function sessionCookieHeader(cookie: SessionCookie): string {
	const parts = [`${cookie.name}=${encodeURIComponent(cookie.value)}`, `Path=${cookie.attributes.path}`];
	if (cookie.attributes.maxAge !== undefined) parts.push(`Max-Age=${cookie.attributes.maxAge}`);
	if (cookie.attributes.expires) parts.push(`Expires=${cookie.attributes.expires.toUTCString()}`);
	parts.push('HttpOnly', 'SameSite=Lax');
	if (cookie.attributes.secure) parts.push('Secure');
	return parts.join('; ');
}

/**
 * A body the legacy handler read with its own `request.json()`: a non-object
 * reads as `{}` (its field reads were `undefined`), a missing or unparseable
 * body answers `null` so the caller decides (the house 400, or the 500 its own
 * `try` gave).
 */
async function readJsonRecord(request: Request): Promise<Record<string, JsonValue> | null> {
	let text: string;
	try {
		text = await request.text();
	} catch {
		return null;
	}
	if (!text.trim()) return {};
	try {
		const value: unknown = JSON.parse(text);
		return typeof value === 'object' && value !== null && !Array.isArray(value)
			? (value as Record<string, JsonValue>)
			: {};
	} catch {
		return null;
	}
}

/** One string field off a legacy body read: a non-string reads `''`. */
function stringField(body: Record<string, JsonValue>, key: string): string {
	const value = body[key];
	return typeof value === 'string' ? value : '';
}

/** The page-code screens' `{success:false,error}` envelope at a status. */
function codeFailure(status: number, message: string): Response {
	return reply(status, { success: false, error: message });
}

/** A 200 with no body and the session cookie (the legacy code sign-ins). */
function signedInResponse(cookie: SessionCookie): Response {
	return new Response(null, {
		status: 200,
		headers: { 'Set-Cookie': sessionCookieHeader(cookie) }
	});
}

/** `/login/email` and `/signup/email` share their envelope and their 500 copy. */
async function emailLinkAction(
	run: () => Promise<SendResult>,
	failMessage: string
): Promise<Response> {
	try {
		const result = await run();
		if (!result.sent) return codeFailure(500, failMessage);
		return ok({ success: true });
	} catch (cause) {
		if (isAppError(cause)) return codeFailure(cause.status, cause.message);
		throw cause;
	}
}

// --- `/api/logout` and the mobile door --------------------------------------

/** `POST /api/logout` — 302 `/` whether or not a session existed, cookie cleared (Q-105). */
export const logoutEndpoint = endpoint({
	auth: 'optional',
	handle: async ({ ctx, actor, event }) => {
		if (actor) await signOut(ctx, actor, { sessionId: event.locals.session?.id ?? null });
		// Q-105 B: an explicit 302 rather than kit's thrown redirect, because only a
		// response can carry the clearing `Set-Cookie` the browser needs.
		return new Response(null, {
			status: 302,
			headers: {
				location: LOGOUT_REDIRECT_PATH,
				// identity's one expireCookie shape: empty value, `Max-Age=0`, epoch expiry.
				'Set-Cookie': sessionCookieHeader(blankSessionCookie(ctx))
			}
		});
	}
});

/** `POST /api/mobile/auth/logout` — revokes exactly the presented `fp_` token. */
export const mobileLogoutEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor, event }) => {
		const token = bearerTokenOf(event.request);
		if (!token) return reply(401, { error: UNAUTHORIZED_MESSAGE });
		await signOut(ctx, actor, { token });
		return ok({ success: true });
	}
});

// --- `/api/me/*` ------------------------------------------------------------

/** `POST /api/me/claim {email}` — guests only; `{sent:true}` either way. */
export const claimRequestBodyEndpoint = endpoint({
	auth: 'user',
	body: ClaimRequestBody,
	failMessage: CLAIM_SEND_FAILED_MESSAGE,
	handle: async ({ ctx, actor, body, event }) => {
		const result = await requestClaim(ctx, actor, {
			email: body.email,
			clientIp: clientIpOf(event.request),
			baseUrl: ctx.config.siteUrl
		});
		if (!result.sent) return reply(500, { error: CLAIM_SEND_FAILED_MESSAGE });
		return ok({ sent: true });
	}
});

/** `POST /api/me/email {email}` — mails a code+link to the NEW address. */
export const changeEmailEndpoint = endpoint({
	auth: 'user',
	body: ChangeEmailBody,
	failMessage: EMAIL_CHANGE_SEND_FAILED_MESSAGE,
	handle: async ({ ctx, actor, body, event }) =>
		ok(
			await requestEmailChange(ctx, actor, {
				email: body.email,
				clientKey: clientKeyOf(event.request, `email-change:${actor.id}`),
				siteUrl: ctx.config.siteUrl
			})
		)
});

/**
 * The verify-email answer, shared by `/api/me/verify-email` and the web
 * `/signup/password/verify`: refusals carry `{success:false,error}` (the golden
 * pins it on the 429 too), success is `{success:true}`.
 */
async function verifyEmailCodeResponse(
	ctx: Ctx,
	input: { readonly code: string; readonly email: string; readonly clientIp: string }
): Promise<Response> {
	try {
		await verifySignupCode(ctx, input);
		return ok({ success: true });
	} catch (cause) {
		if (isAppError(cause)) return codeFailure(cause.status, cause.message);
		throw cause;
	}
}

/** `POST /api/me/verify-email {code}` — the caller's OWN address, never the body's. */
export const verifyEmailEndpoint = endpoint({
	auth: 'user',
	body: VerifyEmailBody,
	handle: async ({ ctx, actor, body, event }) => {
		if (!actor.email) return reply(401, { error: UNAUTHORIZED_MESSAGE });
		return verifyEmailCodeResponse(ctx, {
			code: body.code,
			email: actor.email,
			clientIp: clientIpOf(event.request)
		});
	}
});

/** `POST /api/me/verify-email/resend` — reads no body at all (legacy never did). */
export const resendVerificationEndpoint = endpoint({
	auth: 'user',
	failMessage: RESEND_FAILED_MESSAGE,
	handle: async ({ ctx, actor, event }) => {
		const result = await resendSignupCode(ctx, actor, {
			clientIp: clientIpOf(event.request),
			baseUrl: ctx.config.siteUrl
		});
		if (!result.sent) return reply(500, { error: RESEND_FAILED_MESSAGE });
		return ok({ success: true });
	}
});

// --- `/api/mobile/auth/*` ---------------------------------------------------

/** `POST /api/mobile/auth/email` — codes for both intents; `{sent:true}` always. */
export const mobileEmailEndpoint = endpoint({
	auth: 'public',
	bodyMode: 'lenient',
	body: MobileEmailBody,
	failMessage: MOBILE_SERVER_ERROR_MESSAGE,
	handle: async ({ ctx, body, event }) => {
		const result = await requestMobileEmailCode(ctx, {
			email: body.email,
			intent: body.intent,
			firstName: body.firstName,
			lastName: body.lastName,
			clientIp: clientIpOf(event.request),
			baseUrl: ctx.config.siteUrl
		});
		if (!result.sent) return reply(500, { error: MOBILE_SEND_FAILED_MESSAGE });
		return ok({ sent: true });
	}
});

/** `POST /api/mobile/auth/verify` — redeems a code into `{token,user}`. */
export const mobileVerifyEndpoint = endpoint({
	auth: 'public',
	bodyMode: 'lenient',
	body: MobileVerifyBody,
	failMessage: MOBILE_SERVER_ERROR_MESSAGE,
	handle: async ({ ctx, body, event }) => {
		const result = await verifyMobileEmailCode(ctx, {
			email: body.email,
			code: body.code,
			intent: body.intent,
			deviceName: body.deviceName,
			clientIp: clientIpOf(event.request)
		});
		if (result.outcome === 'bad-code') return reply(400, { error: MOBILE_WRONG_CODE_MESSAGE });
		if (result.outcome === 'account-exists') {
			return reply(409, { error: MOBILE_ACCOUNT_EXISTS_MESSAGE });
		}
		return ok({ token: result.token, user: result.user });
	}
});

/** `POST /api/mobile/auth/password` — the app's password door. */
export const mobilePasswordEndpoint = endpoint({
	auth: 'public',
	bodyMode: 'lenient',
	body: MobilePasswordBody,
	failMessage: MOBILE_SERVER_ERROR_MESSAGE,
	handle: async ({ ctx, body, event }) =>
		ok(
			await signInMobileWithPassword(ctx, {
				email: body.email,
				password: body.password,
				deviceName: body.deviceName,
				clientIp: clientIpOf(event.request)
			})
		)
});

/** `POST /api/mobile/auth/guest` — an Anonymous Account; an empty body is `{}`. */
export const mobileGuestEndpoint = endpoint({
	auth: 'public',
	bodyMode: 'empty-object',
	body: MobileGuestBody,
	failMessage: MOBILE_SERVER_ERROR_MESSAGE,
	handle: async ({ ctx, body, event }) =>
		ok(
			await createMobileGuest(ctx, {
				deviceName: body.deviceName,
				clientIp: clientIpOf(event.request)
			})
		)
});

/** `POST /api/mobile/auth/signup` — 200 pending, same shape for a taken address. */
export const mobileSignupEndpoint = endpoint({
	auth: 'public',
	body: MobileSignupBody,
	failMessage: MOBILE_SERVER_ERROR_MESSAGE,
	handle: async ({ ctx, body, event }) => {
		const result = await signUpMobileWithPassword(ctx, {
			email: body.email,
			password: body.password,
			firstName: body.firstName,
			lastName: body.lastName,
			clientIp: clientIpOf(event.request),
			baseUrl: ctx.config.siteUrl,
			deviceName: body.deviceName
		});
		if (result.outcome === 'taken') {
			return ok({
				token: '',
				user: {
					id: '',
					firstName: body.firstName,
					lastName: body.lastName,
					email: body.email,
					emailVerified: false
				},
				emailVerification: 'pending'
			});
		}
		return ok({
			token: result.token,
			user: { ...toMobileUser(result.user), emailVerified: false },
			emailVerification: 'pending'
		});
	}
});

/**
 * `POST /api/mobile/auth/forgot {email}` — the web reset mail, `{sent:true}`.
 * Q-062 B: a body the legacy `request.json()` could not read (malformed or
 * empty) is the house `400 Invalid JSON`, not the 500 send copy.
 */
export const mobileForgotEndpoint = endpoint({
	auth: 'public',
	body: ForgotPasswordBody,
	bodyMode: 'strict',
	failMessage: FORGOT_SEND_FAILED_MESSAGE,
	handle: async ({ ctx, body, event }) => {
		await requestPasswordReset(ctx, {
			email: body.email,
			clientKey: clientKeyOf(event.request, `reset:${body.email.toLowerCase()}`),
			siteUrl: ctx.config.siteUrl
		});
		return ok({ sent: true });
	}
});

/**
 * `POST /api/mobile/auth/reset {token,password}` — the shared reset. Q-062 B
 * gives an unreadable body the house 400, and the 10 / 15 min per-IP cap lives
 * in `resetPassword` itself (Q-066), so this door and the web form share one
 * bucket and there is exactly one limiter.
 */
export const mobileResetEndpoint = endpoint({
	auth: 'public',
	body: ResetPasswordBody,
	bodyMode: 'strict',
	failMessage: RESET_FAILED_MESSAGE,
	handle: async ({ ctx, body, event }) =>
		ok(
			await resetPassword(ctx, {
				...body,
				clientKey: clientKeyOf(event.request, RESET_ATTEMPT_SCOPE)
			})
		)
});

// --- Page-group JSON endpoints ---------------------------------------------

/** `POST /login/email/code {code,email}` — 200 + cookie, or the page's 500s. */
export const loginCodeEndpoint = endpoint({
	auth: 'public',
	handle: async ({ ctx, event }) => {
		// Remember the arriving guest so the merge prompt can fire after auth
		// (legacy stashed before it read the body).
		await stashGuestFromCookies(ctx, event.cookies);
		const body = await readJsonRecord(event.request);
		if (body === null) return codeFailure(400, 'Invalid JSON');
		const result = await completeEmailLoginCode(ctx, {
			code: stringField(body, 'code'),
			email: stringField(body, 'email'),
			actor: event.locals.actor ?? null,
			sessionId: event.locals.session?.id ?? null,
			clientIp: clientIpOf(event.request)
		});
		if (result.outcome === 'signed-in') return signedInResponse(result.cookie);
		// Q-064 B: an orphaned login code answers the generic copy, never its state.
		if (result.outcome === 'no-account') {
			return codeFailure(500, VERIFY_GENERIC_ERROR_MESSAGE);
		}
		return codeFailure(400, VERIFY_GENERIC_ERROR_MESSAGE);
	}
});

/** `POST /signup/email/code {code,email}` — 200 + cookie, or the page's 500s. */
export const signupCodeEndpoint = endpoint({
	auth: 'public',
	handle: async ({ ctx, event }) => {
		await stashGuestFromCookies(ctx, event.cookies);
		const body = await readJsonRecord(event.request);
		if (body === null) return codeFailure(400, 'Invalid JSON');
		const result = await completeEmailSignupCode(ctx, {
			code: stringField(body, 'code'),
			email: stringField(body, 'email'),
			clientIp: clientIpOf(event.request)
		});
		if (result.outcome === 'signed-in') return signedInResponse(result.cookie);
		// Q-064 B: a taken address answers the generic copy, never the membership.
		if (result.outcome === 'taken') return codeFailure(500, VERIFY_GENERIC_ERROR_MESSAGE);
		if (result.outcome === 'broken-row') return codeFailure(500, VERIFY_GENERIC_ERROR_MESSAGE);
		return codeFailure(400, VERIFY_GENERIC_ERROR_MESSAGE);
	}
});

// --- `/login/email`, `/login/password`, `/signup/*`, `/forgot-password*` ----

/** `POST /login/email {email,redirectTo?}` — the emailed sign-in link. */
export const loginEmailAction = endpoint({
	auth: 'public',
	handle: async ({ ctx, event }) => {
		const body = await readJsonRecord(event.request);
		if (body === null) return codeFailure(400, 'Invalid JSON');
		return emailLinkAction(
			() =>
				startEmailLogin(ctx, {
					email: stringField(body, 'email'),
					redirectTo: body.redirectTo,
					clientIp: clientIpOf(event.request),
					baseUrl: ctx.config.siteUrl
				}),
			'There was an error. Please try again.'
		);
	}
});

/** `POST /login/password {email,password}` — 200 `{success,user}` + cookie. */
export const loginPasswordAction = endpoint({
	auth: 'public',
	failMessage: 'Failed to login',
	handle: async ({ ctx, event }) => {
		await stashGuestFromCookies(ctx, event.cookies);
		const body = await readJsonRecord(event.request);
		if (body === null) return reply(500, { error: 'Failed to login' });
		const started = await signInWithPassword(ctx, {
			email: stringField(body, 'email'),
			password: stringField(body, 'password'),
			actor: event.locals.actor ?? null,
			sessionId: event.locals.session?.id ?? null,
			clientIp: clientIpOf(event.request)
		});
		return ok(
			{
				success: true,
				user: {
					id: started.user.id,
					email: started.user.email,
					firstName: started.user.firstName
				}
			},
			{ 'Set-Cookie': sessionCookieHeader(started.cookie) }
		);
	}
});

/** `POST /signup/email {email,firstName,lastName,redirectTo?}`. */
export const signupEmailAction = endpoint({
	auth: 'public',
	handle: async ({ ctx, event }) => {
		const body = await readJsonRecord(event.request);
		if (body === null) return codeFailure(400, 'Invalid JSON');
		return emailLinkAction(
			() =>
				startEmailSignup(ctx, {
					email: stringField(body, 'email'),
					firstName: body.firstName,
					lastName: body.lastName,
					redirectTo: body.redirectTo,
					clientIp: clientIpOf(event.request),
					baseUrl: ctx.config.siteUrl
				}),
			'There was an error. Please try again.'
		);
	}
});

/**
 * `POST /signup/password` — 201 pending + cookie, or the identical pending
 * shape with `user.id:''` and no session for a taken address.
 */
export const signupPasswordAction = endpoint({
	auth: 'public',
	failMessage: 'Failed to create account',
	handle: async ({ ctx, event }) => {
		await stashGuestFromCookies(ctx, event.cookies);
		const body = await readJsonRecord(event.request);
		if (body === null) return reply(500, { error: 'Failed to create account' });
		const result = await signUpWebWithPassword(ctx, {
			email: stringField(body, 'email'),
			password: stringField(body, 'password'),
			firstName: stringField(body, 'firstName'),
			lastName: stringField(body, 'lastName'),
			clientIp: clientIpOf(event.request),
			baseUrl: ctx.config.siteUrl
		});
		if (result.outcome === 'taken') {
			return reply(201, {
				success: true,
				user: {
					id: '',
					email: stringField(body, 'email'),
					firstName: stringField(body, 'firstName')
				},
				emailVerification: 'pending'
			});
		}
		return reply(
			201,
			{
				success: true,
				user: {
					id: result.user.id,
					email: result.user.email,
					firstName: result.user.firstName
				},
				emailVerification: 'pending'
			},
			{ 'Set-Cookie': sessionCookieHeader(result.cookie) }
		);
	}
});

/** `POST /signup/password/resend` — the caller's own address; no body read. */
export const passwordResendAction = endpoint({
	auth: 'user',
	failMessage: RESEND_FAILED_MESSAGE,
	handle: async ({ ctx, actor, event }) => {
		const result = await resendSignupCode(ctx, actor, {
			clientIp: clientIpOf(event.request),
			baseUrl: ctx.config.siteUrl
		});
		if (!result.sent) return reply(500, { error: RESEND_FAILED_MESSAGE });
		return ok({ success: true });
	}
});

/** `POST /signup/password/verify {code,email}` — the web's own verify door. */
export const passwordVerifyAction = endpoint({
	auth: 'public',
	handle: async ({ ctx, event }) => {
		const body = await readJsonRecord(event.request);
		if (body === null) return codeFailure(400, 'Invalid JSON');
		return verifyEmailCodeResponse(ctx, {
			code: stringField(body, 'code'),
			email: stringField(body, 'email'),
			clientIp: clientIpOf(event.request)
		});
	}
});

/**
 * `POST /forgot-password {email}` — `{success:true}` for everyone. Q-062 B: an
 * unreadable body is the house `400 Invalid JSON` on this form too.
 */
export const forgotPasswordAction = endpoint({
	auth: 'public',
	body: ForgotPasswordBody,
	bodyMode: 'strict',
	failMessage: FORGOT_SEND_FAILED_MESSAGE,
	handle: async ({ ctx, body, event }) => {
		await requestPasswordReset(ctx, {
			email: body.email,
			clientKey: clientKeyOf(event.request, `reset:${body.email.toLowerCase()}`),
			siteUrl: ctx.config.siteUrl
		});
		return ok({ success: true });
	}
});

/**
 * `POST /forgot-password/reset {token,password}` — the web reset form, under the
 * same 10 / 15 min per-IP cap as the mobile door (Q-066: the service owns it).
 */
export const resetPasswordAction = endpoint({
	auth: 'public',
	body: ResetPasswordBody,
	bodyMode: 'strict',
	failMessage: RESET_FAILED_MESSAGE,
	handle: async ({ ctx, body, event }) =>
		ok(
			await resetPassword(ctx, {
				...body,
				clientKey: clientKeyOf(event.request, RESET_ATTEMPT_SCOPE)
			})
		)
});
