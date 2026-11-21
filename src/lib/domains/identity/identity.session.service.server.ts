/**
 * identity session service: create, validate (with the sliding renewal),
 * end, end-all and end-others, plus the signed-cookie seam hooks use.
 *
 * The HMAC and its constant-time compare are here (node:crypto), exactly
 * where legacy had them; the pure lifetime/attribute/value-shape rules stay in
 * `identity.session.rules.ts`. The signing secret and the production flag
 * come from `ctx.config` (the app resolves the fail-closed secret once at
 * boot), so no function reads the environment (R6) and no test mocks a module
 * (R9).
 *
 * Doc: ./README.md#public-interface
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { AuthSessionRow, UserRow } from '$lib/kernel/db/tables.server';
import {
	blankSessionCookieAttributes,
	isSessionExpired,
	liveSessionCookieAttributes,
	SESSION_COOKIE_NAME,
	SESSION_ID_LENGTH,
	SESSION_TOKEN_LENGTH,
	sessionExpiresAt,
	sessionRenewalDue,
	signedSessionCookieValue,
	splitSignedSessionCookie,
	type SessionCookieAttributes
} from './identity.session.rules';
import { touchDue } from './identity.person.rules';
import {
	deleteOtherSessions,
	deleteSession,
	deleteSessionsForPerson,
	findPersonById,
	findSessionByToken,
	insertSession,
	renewSession,
	touchPersonLastActive
} from './identity.repo.server';

/** A cookie a caller can hand to kit's `cookies.set` (or serialize itself). */
export type SessionCookie = {
	readonly name: string;
	readonly value: string;
	readonly attributes: SessionCookieAttributes;
};

/** `startSession` answers the stored row and the cookie that carries it. */
export type StartedSession = {
	readonly session: AuthSessionRow;
	readonly cookie: SessionCookie;
};

/** A session row plus whether this request created or rolled it. */
export type ActiveSession = AuthSessionRow & { readonly fresh: boolean };

/** What `validateSession` answers; both halves are null or both are set. */
export type SessionValidation = {
	readonly session: ActiveSession | null;
	readonly person: UserRow | null;
};

/**
 * What the pipeline's cookie path needs: the signed-in person, and the cookie
 * to write back (only when something changed).
 */
export type SessionResolution = SessionValidation & {
	/** The rolled cookie when the row was fresh, the blank one when the value did not validate, else null. */
	readonly cookie: SessionCookie | null;
};

const NO_SESSION: SessionValidation = { session: null, person: null };

/** better-auth's signature: HMAC-SHA256, standard base64 (44 chars, `=`-padded). */
export function signSessionToken(secret: string, token: string): string {
	return createHmac('sha256', secret).update(token).digest('base64');
}

/**
 * The inverse of the signature: the raw session token, or null when the value
 * cannot be a signed session or the signature does not match in constant time.
 */
export function verifySessionToken(secret: string, value: string): string | null {
	const split = splitSignedSessionCookie(value);
	if (!split) return null;
	const expected = Buffer.from(signSessionToken(secret, split.token), 'base64');
	const actual = Buffer.from(split.signature, 'base64');
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
	return split.token;
}

/** A live session cookie (raw `token.signature`; kit encodes once on the wire). */
export function sessionCookie(ctx: Ctx, token: string): SessionCookie {
	return {
		name: SESSION_COOKIE_NAME,
		value: signedSessionCookieValue(token, signSessionToken(ctx.config.sessionSecret, token)),
		attributes: liveSessionCookieAttributes(ctx.config.production)
	};
}

/** better-auth's expireCookie: an empty value, already expired. */
export function blankSessionCookie(ctx: Ctx): SessionCookie {
	return {
		name: SESSION_COOKIE_NAME,
		value: '',
		attributes: blankSessionCookieAttributes(ctx.config.production)
	};
}

/**
 * One seam for a new session: a 15-char id, a 32-char token and the 90-day
 * expiry, stamped with `ctx.clock.now()`, plus the cookie that carries it.
 */
export async function startSession(ctx: Ctx, userId: string): Promise<StartedSession> {
	const now = ctx.clock.now();
	const session = await insertSession(
		ctx.db,
		{
			id: ctx.ids.id(SESSION_ID_LENGTH),
			token: ctx.ids.id(SESSION_TOKEN_LENGTH),
			userId,
			expiresAt: sessionExpiresAt(now)
		},
		now
	);
	return { session, cookie: sessionCookie(ctx, session.token) };
}

/**
 * Validates a raw cookie value. Missing/invalid signature → no session. An
 * expired row is deleted; a row older than 24 h of use rolls its expiry
 * forward (`fresh: true`, so hooks re-issue the cookie); a row whose person is
 * gone is deleted and resolves to no session.
 */
export async function validateSession(
	ctx: Ctx,
	cookieValue: string | undefined
): Promise<SessionValidation> {
	const token = cookieValue ? verifySessionToken(ctx.config.sessionSecret, cookieValue) : null;
	if (!token) return NO_SESSION;
	const row = await findSessionByToken(ctx.db, token);
	if (!row) return NO_SESSION;

	const now = ctx.clock.now();
	if (isSessionExpired(row.expiresAt, now)) {
		await deleteSession(ctx.db, row.id);
		return NO_SESSION;
	}

	const renew = sessionRenewalDue(row.updatedAt, now);
	if (renew) await renewSession(ctx.db, row.id, sessionExpiresAt(now), now);

	const person = await findPersonById(ctx.db, row.userId);
	if (!person) {
		await deleteSession(ctx.db, row.id);
		return NO_SESSION;
	}
	return { session: { ...row, fresh: renew }, person };
}

/**
 * The pipeline's cookie path in one call (`src/hooks.server.ts:64-70,99-113`):
 * validate the presented value, write the rolled cookie back when the row was
 * fresh, overwrite a dead value with the blank cookie (the "blank-cookie
 * cascade", so a browser stops sending it), and count the request as activity
 * — `lastActiveAt` is touched at most hourly.
 */
export async function resolveSessionCookie(
	ctx: Ctx,
	cookieValue: string
): Promise<SessionResolution> {
	const { session, person } = await validateSession(ctx, cookieValue);
	if (!session || !person) {
		return { session: null, person: null, cookie: blankSessionCookie(ctx) };
	}
	const now = ctx.clock.now();
	if (touchDue(person.lastActiveAt, now)) {
		await touchPersonLastActive(ctx.db, person.id, now);
	}
	return { session, person, cookie: session.fresh ? sessionCookie(ctx, session.token) : null };
}

export async function endSession(ctx: Ctx, sessionId: string): Promise<void> {
	await deleteSession(ctx.db, sessionId);
}

/** "Log out everywhere": every session of the person. Returns how many went. */
export async function endAllSessions(ctx: Ctx, userId: string): Promise<number> {
	return await deleteSessionsForPerson(ctx.db, userId);
}

/**
 * "Log out other devices": every session except `keepSessionId` (the caller's
 * own cookie session; null for a Bearer caller, which keeps none). One
 * owner-scoped DELETE. Returns how many went.
 */
export async function endOtherSessions(
	ctx: Ctx,
	actor: Actor,
	options: { readonly keepSessionId: string | null }
): Promise<number> {
	return await deleteOtherSessions(ctx.db, actor.id, options.keepSessionId);
}
