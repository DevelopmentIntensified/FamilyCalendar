/**
 * access sign-in services: the link and code doors, the password door shared by
 * the web form and the Android JSON endpoint, the Android Anonymous Account
 * door, and the two ways a session ends.
 *
 * Nothing here hashes, mints or stores: the link comes from
 * `access.emailLink.service.server.ts`, the person from identity, the session
 * cookie from identity's session service, the `fp_` token from identity's token
 * service. What lives here is the decision order — the gate before the lookup,
 * the generic refusal for every wrong credential, and the one place the
 * arriving guest session is killed, exactly once.
 *
 * Legacy `updateLastLogin` is NOT reproduced: identity exports no
 * `users.lastLogin` write and no observable flow reads the column.
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { invalid, tooMany } from '$lib/kernel/errors/appError';
import { isEmailAddress } from '$lib/kernel/validation/validators';
import {
	createAnonymousAccount,
	createEmailPerson,
	endSession,
	ensurePersonSettings,
	findEmailCode,
	findPersonForSignIn,
	getPersonByEmail,
	mintApiToken,
	redeemEmailCode,
	startSession,
	verifyPassword,
	discardEmailCodes,
	type SessionCookie
} from '$lib/domains/identity/index.server';
import { ensurePersonalCalendar } from '$lib/domains/calendar/index.server';
import {
	EMAIL_LOGIN_REQUIRED_MESSAGE,
	INVALID_CREDENTIALS_MESSAGE,
	INVALID_EMAIL_MESSAGE,
	MOBILE_INVALID_EMAIL_MESSAGE,
	MOBILE_INVALID_INTENT_MESSAGE,
	MOBILE_MISSING_NAME_MESSAGE,
	MOBILE_MISSING_PASSWORD_MESSAGE,
	MOBILE_RATE_LIMIT_MESSAGE,
	MOBILE_WRONG_CODE_MESSAGE,
	MOBILE_WRONG_PASSWORD_MESSAGE,
	RATE_LIMIT_MESSAGE,
	VERIFY_GENERIC_ERROR_MESSAGE,
	type MobileAuthUserResponse
} from './access.contract';
import { mobileTokenName, toMobileUser } from './access.device.rules';
import {
	startEmailLink,
	verifyEmailLinkToken,
	type SendResult
} from './access.emailLink.service.server';
import { isGuestPerson, isRegisteredPerson } from './access.person.rules';
import { emailLinkRedirectPath } from './access.redirect.rules';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

/**
 * The constant dummy bcrypt hash an unknown address pays a compare against
 * (`mobileAuth.ts:100`), so timing never reveals which addresses exist.
 */
const DUMMY_BCRYPT_HASH = '$2a$10$C6UzMDM.H6dfI/f/IKcEeO7ZBpEbF1nZ.PnI1fT4/eqSYQ0xJ0fSO';

/** A mobile answer is cookie-free JSON: the token plus the person the app may see. */
export type MobileSignInResult = {
	readonly token: string;
	readonly user: MobileAuthUserResponse;
};

/** The signed-in actor a token mint is scoped to (no session, no cookie). */
function tokenActor(person: { readonly id: string; readonly email: string | null }): Actor {
	return { id: person.id, email: person.email, isAdmin: false, via: 'token' };
}

export type StartLoginInput = {
	readonly email: string;
	readonly redirectTo?: unknown;
	readonly clientIp: string;
	readonly baseUrl?: string;
};

/** `POST /login/email`: validate, gate, suppress an unknown address silently. */
export async function startEmailLogin(
	ctx: Ctx,
	input: StartLoginInput
): Promise<SendResult> {
	return await startEmailLink(ctx, {
		kind: 'login',
		...input,
		copy: {
			invalidEmail: INVALID_EMAIL_MESSAGE,
			// Unreachable for login; the seam requires the field and keeps one shape.
			missingName: INVALID_EMAIL_MESSAGE,
			rateLimited: RATE_LIMIT_MESSAGE
		}
	});
}

/** What a redeemed login code produced, for the page-JSON route to map. */
export type LoginCodeOutcome =
	| { readonly outcome: 'signed-in'; readonly cookie: SessionCookie }
	/** Unknown, wrong-email, wrong-type or expired code: one generic 400. */
	| { readonly outcome: 'bad-code' }
	/** The code is live but no account is behind it: legacy 500, code kept (Q-064). */
	| { readonly outcome: 'no-account' };

/**
 * `POST /login/email/code`: the account lookup runs BEFORE the code is burned
 * (legacy read the row, then the account, then deleted), so an orphaned code
 * survives for its full 15 minutes.
 */
export async function completeEmailLoginCode(
	ctx: Ctx,
	input: {
		readonly code: string;
		readonly email: string;
		readonly actor: Actor | null;
		readonly sessionId: string | null;
		readonly clientIp: string;
	}
): Promise<LoginCodeOutcome> {
	if (
		!ctx.limiter.allow(
			`verify-login-code:${input.email.toLowerCase()}:${input.clientIp}`,
			10,
			FIFTEEN_MINUTES
		)
	) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}
	if (!input.code || !input.email) throw invalid(VERIFY_GENERIC_ERROR_MESSAGE);

	const key = { code: input.code, email: input.email, type: 'login' };
	const row = await findEmailCode(ctx, key);
	if (!row) return { outcome: 'bad-code' };
	if (row.expiresAt.getTime() < ctx.clock.now().getTime()) {
		await redeemEmailCode(ctx, key);
		return { outcome: 'bad-code' };
	}

	// Legacy required the provider ACCOUNT here (`getAccount`) and used its
	// owner; a live code with no binding is the "No Account found" branch.
	const lookup = await findPersonForSignIn(ctx, input.email);
	if (!lookup.bound || !lookup.person) return { outcome: 'no-account' };

	const started = await startSession(ctx, lookup.person.id);
	await redeemEmailCode(ctx, key);
	await endArrivingGuestSession(
		ctx,
		input.actor,
		input.sessionId,
		lookup.person.id,
		started.session.id
	);
	return { outcome: 'signed-in', cookie: started.cookie };
}

/** What a clicked login link produced, for the callback route to redirect on. */
export type LoginLinkOutcome =
	| { readonly outcome: 'invalid-token' }
	| { readonly outcome: 'already-signed-in' }
	| {
			readonly outcome: 'signed-in';
			readonly cookie: SessionCookie;
			readonly redirectTo: string;
	  };

/**
 * `GET /login/email/callback`: a registered signed-in person is refused (the
 * route answers its error redirect); a guest session falls through, gets the
 * new session, and is killed exactly once. Every code for the address is then
 * cleared (`deleteCodesByEmail`).
 */
export async function completeEmailLoginLink(
	ctx: Ctx,
	input: {
		readonly token: string | null;
		readonly actor: Actor | null;
		readonly sessionId: string | null;
	}
): Promise<LoginLinkOutcome> {
	if (input.actor && isRegisteredPerson(input.actor)) return { outcome: 'already-signed-in' };
	if (!input.token) return { outcome: 'invalid-token' };

	const verified = await verifyEmailLinkToken(ctx, input.token, 'login');
	if (!verified.ok) return { outcome: 'invalid-token' };
	const payload = verified.payload;

	const lookup = await findPersonForSignIn(ctx, payload.email);
	if (!lookup.person) return { outcome: 'invalid-token' };

	const started = await startSession(ctx, lookup.person.id);
	await endArrivingGuestSession(
		ctx,
		input.actor,
		input.sessionId,
		lookup.person.id,
		started.session.id
	);
	await discardEmailCodes(ctx, payload.email);
	return {
		outcome: 'signed-in',
		cookie: started.cookie,
		redirectTo: emailLinkRedirectPath(payload.redirectTo)
	};
}

/**
 * THE anonymous-swap invariant, in its one access home: when a guest signs in as
 * a real account, kill the session they arrived on — and only then, exactly
 * once (`auth.ts:224-240`).
 */
async function endArrivingGuestSession(
	ctx: Ctx,
	actor: Actor | null,
	sessionId: string | null,
	newUserId: string,
	newSessionId: string
): Promise<void> {
	if (!actor || !sessionId) return;
	if (!isGuestPerson(actor)) return;
	if (actor.id === newUserId) return;
	if (sessionId === newSessionId) return;
	await endSession(ctx, sessionId);
}

export type SignInWithPasswordInput = {
	readonly email: string;
	readonly password: string;
	readonly actor: Actor | null;
	readonly sessionId: string | null;
	readonly clientIp: string;
};

export type PasswordSignInResult = {
	readonly cookie: SessionCookie;
	/** The person the session belongs to — the route echoes id, email and first name. */
	readonly user: UserRow;
};

/**
 * `POST /login/password`: 10 / 5 min per address + IP; an unknown address, an
 * Anonymous Account and a wrong password are one generic 401 after a real
 * bcrypt compare; a passwordless account answers the "use email login" copy;
 * `emailVerified` is never consulted (legacy signs unverified accounts in).
 */
export async function signInWithPassword(
	ctx: Ctx,
	input: SignInWithPasswordInput
): Promise<PasswordSignInResult> {
	if (!input.email || !input.password) throw invalid(MOBILE_MISSING_PASSWORD_MESSAGE);
	if (
		!ctx.limiter.allow(
			`pw-login:${input.email.toLowerCase()}:${input.clientIp}`,
			10,
			FIVE_MINUTES
		)
	) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}

	const user = await getPersonByEmail(ctx, input.email);
	if (!user || isGuestPerson(user)) {
		await verifyPassword(input.password, DUMMY_BCRYPT_HASH);
		throw invalid(INVALID_CREDENTIALS_MESSAGE);
	}
	if (!user.passwordHash) throw invalid(EMAIL_LOGIN_REQUIRED_MESSAGE);
	if (!(await verifyPassword(input.password, user.passwordHash))) {
		throw invalid(INVALID_CREDENTIALS_MESSAGE);
	}

	await ensurePersonSettings(ctx, user.id);
	const started = await startSession(ctx, user.id);
	await endArrivingGuestSession(ctx, input.actor, input.sessionId, user.id, started.session.id);
	return { cookie: started.cookie, user };
}

export type SignInMobileWithPasswordInput = {
	readonly email: string;
	readonly password: string;
	readonly deviceName: string;
	readonly clientIp: string;
};

/**
 * `POST /api/mobile/auth/password`: the same gate and compare as the web form,
 * answering an `fp_` token instead of a cookie. Unknown address, no password
 * and a wrong password are one generic mobile 401.
 */
export async function signInMobileWithPassword(
	ctx: Ctx,
	input: SignInMobileWithPasswordInput
): Promise<MobileSignInResult> {
	if (!input.email || !input.password) throw invalid(MOBILE_MISSING_PASSWORD_MESSAGE);
	if (
		!ctx.limiter.allow(
			`pw-login:${input.email.toLowerCase()}:${input.clientIp}`,
			10,
			FIVE_MINUTES
		)
	) {
		throw tooMany(MOBILE_RATE_LIMIT_MESSAGE);
	}

	const user = await getPersonByEmail(ctx, input.email);
	if (!user || !user.passwordHash || isGuestPerson(user)) {
		await verifyPassword(input.password, DUMMY_BCRYPT_HASH);
		throw invalid(MOBILE_WRONG_PASSWORD_MESSAGE);
	}
	if (!(await verifyPassword(input.password, user.passwordHash))) {
		throw invalid(MOBILE_WRONG_PASSWORD_MESSAGE);
	}

	// As `/login/password`: settings follow the account.
	await ensurePersonSettings(ctx, user.id);
	const minted = await mintApiToken(ctx, tokenActor(user), {
		name: mobileTokenName(input.deviceName)
	});
	return { token: minted.token, user: toMobileUser(user) };
}

export type RequestMobileEmailInput = {
	readonly email: string;
	readonly intent: string;
	readonly firstName?: unknown;
	readonly lastName?: unknown;
	readonly clientIp: string;
	readonly baseUrl?: string;
};

/**
 * `POST /api/mobile/auth/email`: the same code+link seam and the same
 * `login-code:` / `signup-code:` buckets as the web, with the mobile copy. An
 * unknown login and an already-registered sign-up both answer `{sent:true}`
 * without sending.
 */
export async function requestMobileEmailCode(
	ctx: Ctx,
	input: RequestMobileEmailInput
): Promise<SendResult> {
	if (!isEmailAddress(input.email)) throw invalid(MOBILE_INVALID_EMAIL_MESSAGE);
	if (input.intent !== 'login' && input.intent !== 'signup') {
		throw invalid(MOBILE_INVALID_INTENT_MESSAGE);
	}
	if (
		input.intent === 'signup' &&
		(typeof input.firstName !== 'string' ||
			typeof input.lastName !== 'string' ||
			!input.firstName ||
			!input.lastName)
	) {
		throw invalid(MOBILE_MISSING_NAME_MESSAGE);
	}

	return await startEmailLink(ctx, {
		kind: input.intent,
		email: input.email,
		firstName: input.firstName,
		lastName: input.lastName,
		clientIp: input.clientIp,
		baseUrl: input.baseUrl,
		copy: {
			invalidEmail: MOBILE_INVALID_EMAIL_MESSAGE,
			missingName: MOBILE_MISSING_NAME_MESSAGE,
			rateLimited: MOBILE_RATE_LIMIT_MESSAGE
		}
	});
}

/** What a mobile code redemption produced, for the route to map. */
export type MobileVerifyOutcome =
	| { readonly outcome: 'signed-in'; readonly token: string; readonly user: MobileAuthUserResponse }
	/** Wrong/expired code, or a row that lost its names: one generic mobile 400. */
	| { readonly outcome: 'bad-code' }
	/** The address got an account meanwhile: 409, and the code is burned. */
	| { readonly outcome: 'account-exists' };

/**
 * `POST /api/mobile/auth/verify`: the same hashed, type-stamped rows the web
 * redeems (`signup` / `login`), 10 / 15 min per address + IP. Sign-up creates
 * the verified person from the row's names; login resolves the provider
 * binding first and leaves an orphaned code in place (legacy returned before
 * the delete).
 */
export async function verifyMobileEmailCode(
	ctx: Ctx,
	input: {
		readonly email: string;
		readonly code: string;
		readonly intent: string;
		readonly deviceName: string;
		readonly clientIp: string;
	}
): Promise<MobileVerifyOutcome> {
	if (!isEmailAddress(input.email)) throw invalid(MOBILE_INVALID_EMAIL_MESSAGE);
	if (input.intent !== 'login' && input.intent !== 'signup') {
		throw invalid(MOBILE_INVALID_INTENT_MESSAGE);
	}
	if (!input.code) throw invalid(MOBILE_WRONG_CODE_MESSAGE);

	if (
		!ctx.limiter.allow(
			`verify-${input.intent}-code:${input.email.toLowerCase()}:${input.clientIp}`,
			10,
			FIFTEEN_MINUTES
		)
	) {
		throw tooMany(MOBILE_RATE_LIMIT_MESSAGE);
	}

	const key = { code: input.code, email: input.email, type: input.intent };
	const row = await findEmailCode(ctx, key);
	if (!row) return { outcome: 'bad-code' };
	if (row.expiresAt.getTime() < ctx.clock.now().getTime()) {
		await redeemEmailCode(ctx, key);
		return { outcome: 'bad-code' };
	}

	if (input.intent === 'signup') {
		if (!row.firstName || !row.lastName) return { outcome: 'bad-code' };
		const lookup = await findPersonForSignIn(ctx, input.email);
		if (lookup.bound || lookup.person) {
			await redeemEmailCode(ctx, key);
			return { outcome: 'account-exists' };
		}
		const person = await createEmailPerson(ctx, {
			email: input.email,
			firstName: row.firstName,
			lastName: row.lastName
		});
		await ensurePersonalCalendar(ctx, person.id);
		await redeemEmailCode(ctx, key);
		const minted = await mintApiToken(ctx, tokenActor(person), {
			name: mobileTokenName(input.deviceName)
		});
		return { outcome: 'signed-in', token: minted.token, user: toMobileUser(person) };
	}

	const lookup = await findPersonForSignIn(ctx, input.email);
	if (!lookup.person) return { outcome: 'bad-code' };
	await redeemEmailCode(ctx, key);
	const minted = await mintApiToken(ctx, tokenActor(lookup.person), {
		name: mobileTokenName(input.deviceName)
	});
	return { outcome: 'signed-in', token: minted.token, user: toMobileUser(lookup.person) };
}

export type CreateMobileGuestInput = {
	readonly deviceName: string;
	readonly clientIp: string;
};

/** `POST /api/mobile/auth/guest`: one Anonymous Account plus its `fp_` token. */
export async function createMobileGuest(
	ctx: Ctx,
	input: CreateMobileGuestInput
): Promise<MobileSignInResult> {
	if (
		!ctx.limiter.allow(`mobile-guest:${input.clientIp}`, 10, ONE_HOUR)
	) {
		throw tooMany(MOBILE_RATE_LIMIT_MESSAGE);
	}
	const person = await createAnonymousAccount(ctx);
	const minted = await mintApiToken(ctx, tokenActor(person), {
		name: mobileTokenName(input.deviceName)
	});
	return { token: minted.token, user: toMobileUser(person) };
}
