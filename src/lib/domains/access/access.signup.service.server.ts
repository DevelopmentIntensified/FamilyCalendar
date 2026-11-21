/**
 * access sign-up services: the two ways a person gets an account — an emailed
 * sign-up link/code and email + password — plus the password-verification
 * confirm and its authenticated resend.
 *
 * Every flow here is a composition, not an implementation: the link, code and
 * message come from `access.emailLink.service.server.ts`; the person row,
 * provider binding, settings row and session come from identity; the personal
 * calendar is calendar's lazy creation (its own read ensures it). What lives
 * HERE is the part only access decides — the order of validation, throttling
 * and suppression, exactly which copy each refusal answers, and what the routes
 * then need (a session cookie, or the pending shape).
 *
 * Sign-up does NOT kill an arriving guest session: the legacy sign-up paths
 * never called the anonymous-swap helper (the sheet lists that asymmetry as a
 * candidate, and no owner answer has flipped it yet).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { UserRow } from '$lib/kernel/db/tables.server';
import { invalid, isAppError, tooMany, unauthorized } from '$lib/kernel/errors/appError';
import { listCalendars } from '$lib/domains/calendar/index.server';
import {
	createEmailPerson,
	createPersonWithPassword,
	findEmailCode,
	findPersonForSignIn,
	getPerson,
	getPersonByEmail,
	mintApiToken,
	redeemEmailCode,
	startSession,
	verifyPersonEmail,
	type SessionCookie
} from '$lib/domains/identity/index.server';
import {
	INVALID_EMAIL_MESSAGE,
	MISSING_NAME_MESSAGE,
	PASSWORD_TOO_SHORT_MESSAGE,
	PASSWORD_VERIFY_CALLBACK_PATH,
	RATE_LIMIT_MESSAGE,
	SIGNUP_FIELDS_REQUIRED_MESSAGE,
	VERIFY_GENERIC_ERROR_MESSAGE
} from './access.contract';
import {
	sendSignupVerificationCode,
	startEmailLink,
	verifyEmailLinkToken
} from './access.emailLink.service.server';
import { mobileTokenName } from './access.device.rules';
import { passwordSignupRefusal } from './access.password.rules';
import { isRegisteredPerson } from './access.person.rules';
import { EMAIL_LINK_LANDING_PATH, emailLinkRedirectPath } from './access.redirect.rules';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

/** What a start answers: `sent:true` also covers a silent suppression. */
export type StartSignupResult =
	| { readonly sent: true }
	| { readonly sent: false; readonly reason: 'send-failed' };

export type StartSignupInput = {
	readonly email: string;
	readonly firstName?: unknown;
	readonly lastName?: unknown;
	readonly redirectTo?: unknown;
	readonly clientIp: string;
	readonly baseUrl?: string;
};

/**
 * `POST /signup/email`: validate the address, then the names, then spend the
 * 5 / 15 min bucket, then suppress silently when the address already has an
 * account or user row (`magicLink.ts:280-297`).
 */
export async function startEmailSignup(
	ctx: Ctx,
	input: StartSignupInput
): Promise<StartSignupResult> {
	return await startEmailLink(ctx, {
		kind: 'signup',
		...input,
		copy: {
			invalidEmail: INVALID_EMAIL_MESSAGE,
			missingName: MISSING_NAME_MESSAGE,
			rateLimited: RATE_LIMIT_MESSAGE
		}
	});
}

/** What completing the emailed sign-up code produced, for the route to map. */
export type SignupCodeOutcome =
	| { readonly outcome: 'signed-in'; readonly cookie: SessionCookie }
	/** Unknown, wrong-email, wrong-type or expired code: one generic 400. */
	| { readonly outcome: 'bad-code' }
	/** The row lost the names it was minted with: legacy answered 500 generic. */
	| { readonly outcome: 'broken-row' }
	/** The address got an account meanwhile: legacy answered 500 and burned the code. */
	| { readonly outcome: 'taken' };

/**
 * `POST /signup/email/code`: redeem one `signup` code and create the account
 * from the names stored with it. The code is read WITHOUT consuming it until
 * the flow is ready to burn it, so a broken row keeps it exactly as legacy
 * `getHashedCode` → checks → `deleteHashedCode` did.
 */
export async function completeEmailSignupCode(
	ctx: Ctx,
	input: { readonly code: string; readonly email: string; readonly clientIp: string }
): Promise<SignupCodeOutcome> {
	if (!ctx.limiter.allow(`verify-signup-code:${input.clientIp}`, 10, FIFTEEN_MINUTES)) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}
	if (!input.code || !input.email) throw invalid(VERIFY_GENERIC_ERROR_MESSAGE);

	const key = { code: input.code, email: input.email, type: 'signup' };
	const row = await findEmailCode(ctx, key);
	if (!row) return { outcome: 'bad-code' };
	if (row.expiresAt.getTime() < ctx.clock.now().getTime()) {
		await redeemEmailCode(ctx, key);
		return { outcome: 'bad-code' };
	}
	if (!row.email || !row.firstName || !row.lastName) return { outcome: 'broken-row' };

	// Legacy looked the ACCOUNT up here (not the user row): a signed-up address
	// always has its binding, and the code is burned with the answer.
	if ((await findPersonForSignIn(ctx, input.email)).bound) {
		await redeemEmailCode(ctx, key);
		return { outcome: 'taken' };
	}

	const person = await createEmailPerson(ctx, {
		email: row.email,
		firstName: row.firstName,
		lastName: row.lastName
	});
	// calendar creates the personal calendar lazily on its own read (the legacy
	// `ensurePersonalCalendar` call); calendar exports no narrower seam yet.
	await listCalendars(ctx, {
		id: person.id,
		email: person.email,
		isAdmin: false,
		via: 'session'
	});

	const started = await startSession(ctx, person.id);
	await redeemEmailCode(ctx, key);
	return { outcome: 'signed-in', cookie: started.cookie };
}

/** What a clicked sign-up link produced, for the route to redirect on. */
export type SignupLinkOutcome =
	| { readonly outcome: 'invalid-token' }
	| { readonly outcome: 'already-signed-in'; readonly redirectTo: string }
	| {
			readonly outcome: 'signed-in';
			readonly cookie: SessionCookie;
			readonly redirectTo: string;
	  };

/**
 * `GET /signup/email/callback`: a registered signed-in person lands on the
 * calendar untouched; a guest session falls through and the new account is
 * created (the guest merge is the page layer's stash, not this service).
 * The signed `redirectTo` is re-sanitised on the way out.
 */
export async function completeEmailSignupLink(
	ctx: Ctx,
	input: { readonly token: string | null; readonly actor: Actor | null }
): Promise<SignupLinkOutcome> {
	if (input.actor && isRegisteredPerson(input.actor)) {
		return { outcome: 'already-signed-in', redirectTo: EMAIL_LINK_LANDING_PATH };
	}
	if (!input.token) return { outcome: 'invalid-token' };

	const verified = await verifyEmailLinkToken(ctx, input.token, 'signup');
	if (!verified.ok) return { outcome: 'invalid-token' };
	const payload = verified.payload;

	const lookup = await findPersonForSignIn(ctx, payload.email);
	// Legacy redirected a bound address to the calendar; a person row WITHOUT a
	// binding (a password account) hit the duplicate-email constraint and a 500
	// error redirect. The port answers that same landing without the fault.
	if (lookup.bound || lookup.person) {
		return { outcome: 'already-signed-in', redirectTo: EMAIL_LINK_LANDING_PATH };
	}

	const person = await createEmailPerson(ctx, {
		email: payload.email,
		firstName: payload.firstName ?? '',
		lastName: payload.lastName ?? ''
	});
	await listCalendars(ctx, {
		id: person.id,
		email: person.email,
		isAdmin: false,
		via: 'session'
	});
	const started = await startSession(ctx, person.id);
	return {
		outcome: 'signed-in',
		cookie: started.cookie,
		redirectTo: emailLinkRedirectPath(payload.redirectTo)
	};
}

export type SignUpWithPasswordInput = {
	readonly email: string;
	readonly password: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly clientIp: string;
	readonly baseUrl?: string;
};

/** `created:false` means the address already had an account: same pending shape. */
export type SignUpWithPasswordResult =
	| { readonly created: true; readonly user: UserRow }
	| { readonly created: false };

/**
 * The account-creation half of `POST /signup/password` and
 * `POST /api/mobile/auth/signup` (`passwordSignup.ts:62-102`): four fields, then
 * the length, then 30 / 5 min per IP and 10 / 5 min per address, then a silent
 * `created:false` for a taken address. The caller signs the person in its own
 * way (session cookie or `fp_` token) and answers its own status.
 */
export async function signUpWithPassword(
	ctx: Ctx,
	input: SignUpWithPasswordInput
): Promise<SignUpWithPasswordResult> {
	const refusal = passwordSignupRefusal(input);
	if (refusal === 'missing-fields') throw invalid(SIGNUP_FIELDS_REQUIRED_MESSAGE);
	if (refusal === 'short-password') throw invalid(PASSWORD_TOO_SHORT_MESSAGE);

	if (!ctx.limiter.allow(`pw-signup-ip:${input.clientIp}`, 30, FIVE_MINUTES)) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}
	if (
		!ctx.limiter.allow(
			`pw-signup:${input.email.toLowerCase()}:${input.clientIp}`,
			10,
			FIVE_MINUTES
		)
	) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}

	if (await getPersonByEmail(ctx, input.email)) return { created: false };

	const user = await createPersonWithPassword(ctx, {
		email: input.email,
		firstName: input.firstName,
		lastName: input.lastName,
		password: input.password,
		emailVerified: false,
		roles: []
	});
	await listCalendars(ctx, {
		id: user.id,
		email: user.email,
		isAdmin: false,
		via: 'session'
	});

	// The account exists and is signed in by now, so a refused or failed
	// verification mail is logged, never fatal (`passwordSignup.ts:108-128`); the
	// resend path is the recovery. The address stays out of the log line.
	try {
		const mailed = await sendSignupVerificationCode(ctx, {
			email: user.email,
			firstName: user.firstName,
			lastName: user.lastName,
			clientIp: input.clientIp,
			baseUrl: input.baseUrl,
			rateLimitedMessage: RATE_LIMIT_MESSAGE,
			callbackPath: PASSWORD_VERIFY_CALLBACK_PATH
		});
		if (!mailed.sent) {
			ctx.log.error('access_signup_verification_not_sent', { reason: mailed.reason });
		}
	} catch (error) {
		ctx.log.error('access_signup_verification_not_sent', {
			reason: isAppError(error) ? error.code : 'unknown'
		});
	}

	return { created: true, user };
}

export type WebSignUpOutcome =
	| { readonly outcome: 'created'; readonly user: UserRow; readonly cookie: SessionCookie }
	/** The address already had an account: the same 201 pending shape, no session. */
	| { readonly outcome: 'taken' };

/**
 * `POST /signup/password`: the web's answer after creation — its own session
 * cookie and the caller's id/email/first name. A taken address answers the same
 * 201 pending shape with `user.id:''` and no session (no account oracle).
 */
export async function signUpWebWithPassword(
	ctx: Ctx,
	input: SignUpWithPasswordInput
): Promise<WebSignUpOutcome> {
	const created = await signUpWithPassword(ctx, input);
	if (!created.created) return { outcome: 'taken' };
	const started = await startSession(ctx, created.user.id);
	return { outcome: 'created', user: created.user, cookie: started.cookie };
}

export type MobileSignUpOutcome =
	| { readonly outcome: 'created'; readonly token: string; readonly user: UserRow }
	/** Taken: same 200 pending shape, `token:''`, nothing created or mailed. */
	| { readonly outcome: 'taken' };

/**
 * `POST /api/mobile/auth/signup`: the same creation as the web form, signed in
 * with a personal `fp_` token (`Android — <deviceName>`) instead of a cookie.
 * The caller answers `{token, user: {...toMobileUser, emailVerified:false},
 * emailVerification:'pending'}`.
 */
export async function signUpMobileWithPassword(
	ctx: Ctx,
	input: SignUpWithPasswordInput & { readonly deviceName: string }
): Promise<MobileSignUpOutcome> {
	const created = await signUpWithPassword(ctx, input);
	if (!created.created) return { outcome: 'taken' };
	const minted = await mintApiToken(
		ctx,
		{ id: created.user.id, email: created.user.email, isAdmin: false, via: 'token' },
		{ name: mobileTokenName(input.deviceName) }
	);
	return { outcome: 'created', token: minted.token, user: created.user };
}

export type ResendSignupCodeResult =
	| { readonly sent: true }
	| { readonly sent: false; readonly reason: 'send-failed' };

/**
 * `POST /signup/password/resend` and `/api/me/verify-email/resend`: the caller's
 * own registered address only (Anonymous Account → 401), 5 / 15 min per person
 * and 30 / 5 min per IP, a success no-op once verified, and the same
 * `pw-signup-code:<email>` bucket the sign-up send uses.
 */
export async function resendSignupCode(
	ctx: Ctx,
	actor: Actor,
	input: { readonly clientIp: string; readonly baseUrl?: string }
): Promise<ResendSignupCodeResult> {
	if (!ctx.limiter.allow(`pw-resend:${actor.id}:${input.clientIp}`, 5, FIFTEEN_MINUTES)) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}
	if (!ctx.limiter.allow(`pw-resend-ip:${input.clientIp}`, 30, FIVE_MINUTES)) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}

	let person;
	try {
		person = await getPerson(ctx, actor);
	} catch (error) {
		// A session whose person row is gone has nothing to resend to.
		if (isAppError(error) && error.code === 'notFound') throw unauthorized();
		throw error;
	}
	if (!person.email || person.isAnonymous) throw unauthorized();
	if (person.emailVerified) return { sent: true };

	return await sendSignupVerificationCode(ctx, {
		email: person.email,
		firstName: person.firstName,
		lastName: person.lastName,
		clientIp: input.clientIp,
		baseUrl: input.baseUrl,
		rateLimitedMessage: RATE_LIMIT_MESSAGE,
		callbackPath: PASSWORD_VERIFY_CALLBACK_PATH
	});
}

/**
 * `POST /signup/password/verify` and `POST /api/me/verify-email`: redeem one
 * `password-signup` code for its own address, flip `emailVerified` only when it
 * is false, and burn the row. Unknown, expired, wrong-address and wrong-type all
 * read as the one generic 400; a code whose person row is gone is burned too.
 */
export async function verifySignupCode(
	ctx: Ctx,
	input: { readonly code: string; readonly email: string; readonly clientIp: string }
): Promise<void> {
	if (!ctx.limiter.allow(`pw-verify-code:${input.clientIp}`, 10, FIFTEEN_MINUTES)) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}
	if (!input.code || !input.email) throw invalid(VERIFY_GENERIC_ERROR_MESSAGE);

	const key = { code: input.code, email: input.email, type: 'password-signup' };
	const row = await findEmailCode(ctx, key);
	if (!row) throw invalid(VERIFY_GENERIC_ERROR_MESSAGE);
	if (row.expiresAt.getTime() < ctx.clock.now().getTime()) {
		await redeemEmailCode(ctx, key);
		throw invalid(VERIFY_GENERIC_ERROR_MESSAGE);
	}

	const person = await getPersonByEmail(ctx, row.email);
	if (!person) {
		await redeemEmailCode(ctx, key);
		throw invalid(VERIFY_GENERIC_ERROR_MESSAGE);
	}
	if (!person.emailVerified) await verifyPersonEmail(ctx, person.id);
	await redeemEmailCode(ctx, key);
}
