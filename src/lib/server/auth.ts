// src/lib/server/auth.ts
//
// Session layer (#196 slice 1): better-auth's session model, self-hosted
// behind the same small interface hooks and routes already use.
//
// Why a module-owned seam instead of calling better-auth's API surface:
// better-auth exposes no "create a session for this user id" endpoint (login
// routes do their own bcrypt verification and claim-flow sign-in), so session
// CRUD goes through better-auth's data model directly — its tables
// (`auth_session`/`auth_account`/`auth_verification`), its default cookie
// (`better-auth.session_token`), and its exact signed-cookie scheme
// (URL-encoded `token.hmacSHA256(token)` — standard base64 signature,
// verified by splitting at the last '.', mirroring better-call's
// getSignedCookie). When slice B wires auth.api endpoints, cookies minted
// here validate as-is.
import { createHmac, timingSafeEqual } from 'node:crypto';

import { eq } from 'drizzle-orm';

import type { Cookies } from '@sveltejs/kit';

import { db } from '$lib/server/db';
import { authSession, users } from '$lib/server/db/schema';
import { generateId } from '$lib/server/utils/generateId';
import { isAnonymousAccount } from '$lib/utils/anonymous';

export const SESSION_LIFETIME_SECONDS = 90 * 24 * 60 * 60; // 90d sliding
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60; // renew once per day

export const sessionCookieName = 'better-auth.session_token';

// Secret-or-placeholder: `npm run build` must work with zero env configured
// (same deal as the other build-time secrets); real deployments supply
// BETTER_AUTH_SECRET. The placeholder is for BUILD-TIME type evaluation only —
// at runtime in production a missing secret FAILS CLOSED: this module-level
// check crashes the cold start loudly instead of signing forgeable cookies
// with a key that is public knowledge in the repo.
const DEV_FALLBACK_SECRET = 'better-auth-placeholder-secret-change-me';

const SESSION_SECRET = (() => {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret && process.env.NODE_ENV === 'production') {
		throw new Error(
			'BETTER_AUTH_SECRET is required in production — refusing to sign sessions with the placeholder key.'
		);
	}
	return secret ?? DEV_FALLBACK_SECRET;
})();

function getSecret(): string {
	return SESSION_SECRET;
}

function signSessionToken(token: string): string {
	// Same digest as better-call's signCookieValue: HMAC-SHA256, standard
	// base64 (44 chars, '='-padded).
	return createHmac('sha256', getSecret()).update(token).digest('base64');
}

export function sessionCookieValue(token: string): string {
	// RAW `token.signature` — better-auth's signed-cookie scheme. Do NOT
	// encodeURIComponent here: SvelteKit's cookies.set already URL-encodes
	// once on the wire and cookies.get URLs-decodes once on read, so an
	// extra layer here double-encoded the value (%2B → %252B) and every
	// post-login request failed unsign → anonymous → /login bounce (#196
	// cutover, 2026-10-22).
	return `${token}.${signSessionToken(token)}`;
}

/** Inverse of `sessionCookieValue`: verifies the signature and returns the raw session token, or null. */
export function unsignSessionToken(value: string): string | null {
	const dot = value.lastIndexOf('.');
	if (dot < 1) return null;
	const token = value.slice(0, dot);
	const signature = value.slice(dot + 1);
	if (signature.length !== 44 || !signature.endsWith('=')) return null;
	const expected = Buffer.from(signSessionToken(token), 'base64');
	const actual = Buffer.from(signature, 'base64');
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
	return token;
}

export type SessionCookie = {
	name: string;
	value: string;
	attributes: Record<string, unknown>;
	/** Set-Cookie header form, for JSON responses that can't use kit's cookie API. */
	serialize(): string;
};

const BASE_COOKIE_ATTRIBUTES = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: process.env.NODE_ENV === 'production'
};

function toSetCookie(name: string, value: string, maxAge: number): string {
	const parts = [
		`${name}=${encodeURIComponent(value)}`,
		'Path=/',
		`Max-Age=${maxAge}`,
		`Expires=${new Date(Date.now() + maxAge * 1000).toUTCString()}`,
		'HttpOnly',
		'SameSite=Lax'
	];
	if (process.env.NODE_ENV === 'production') parts.push('Secure');
	return parts.join('; ');
}

function makeSessionCookie(token: string, maxAge: number): SessionCookie {
	return {
		name: sessionCookieName,
		value: maxAge > 0 ? sessionCookieValue(token) : '',
		attributes: { ...BASE_COOKIE_ATTRIBUTES, maxAge },
		serialize: () => toSetCookie(sessionCookieName, maxAge > 0 ? sessionCookieValue(token) : '', maxAge)
	};
}

export async function createSessionCookie(row: { token: string }): Promise<SessionCookie> {
	return makeSessionCookie(row.token, SESSION_LIFETIME_SECONDS);
}

export function createBlankSessionCookie(): SessionCookie {
	// better-auth's expireCookie shape: empty value, immediately expired.
	return {
		name: sessionCookieName,
		value: '',
		attributes: { ...BASE_COOKIE_ATTRIBUTES, maxAge: 0, expires: new Date(0) },
		serialize: () => toSetCookie(sessionCookieName, '', 0)
	};
}

/**
 * One place for setting the session cookie, so path/attribute policy never
 * drifts between call sites.
 */
export function setSessionCookie(
	cookies: Pick<Cookies, 'set'>,
	sessionCookie: Pick<SessionCookie, 'name' | 'value' | 'attributes'>
) {
	cookies.set(sessionCookie.name, sessionCookie.value, {
		path: '/',
		...sessionCookie.attributes
	});
}

export type SessionRow = typeof authSession.$inferSelect;
export type AuthSession = SessionRow & { fresh: boolean };

export type SessionValidationResult = {
	session: AuthSession | null;
	user: typeof users.$inferSelect | null;
};

export async function createSession(userId: string): Promise<AuthSession> {
	const row = {
		id: generateId(15),
		token: generateId(32),
		userId,
		expiresAt: new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000)
	};
	await db.insert(authSession).values(row);
	return { ...row, createdAt: new Date(), updatedAt: new Date(), ipAddress: null, userAgent: null, fresh: true };
}

/**
 * Facade over the individual functions so callers can pass the whole session
 * API as one injectable dep (`deps.session`), matching tests' seam style.
 */
export const session = {
	createSession,
	createSessionCookie,
	validateSession,
	invalidateSession,
	invalidateUserSessions
} as const;

/**
 * Validates a raw cookie value (signed token). Returns `{ session, user }` or
 * the lucia-shaped `{ session: null, user: null }` on missing/invalid/expired.
 * Sliding renewal per better-auth's `updateAge = 1d`: after a day of use the
 * expiry rolls forward 90d from now; `fresh` marks a row created (or rolled)
 * this request so hooks can re-issue the cookie.
 */
export async function validateSession(
	cookieValue: string | undefined
): Promise<SessionValidationResult> {
	const token = cookieValue ? unsignSessionToken(cookieValue) : null;
	if (!token) return { session: null, user: null };
	const [row] = await db.select().from(authSession).where(eq(authSession.token, token));
	if (!row) return { session: null, user: null };
	if (row.expiresAt < new Date()) {
		await db.delete(authSession).where(eq(authSession.id, row.id));
		return { session: null, user: null };
	}
	if (Date.now() - row.updatedAt.getTime() > SESSION_UPDATE_AGE_SECONDS * 1000) {
		await db
			.update(authSession)
			.set({
				expiresAt: new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000),
				updatedAt: new Date()
			})
			.where(eq(authSession.id, row.id));
		return { session: { ...row, fresh: true }, user: await getUserOrDrop(row) };
	}
	return { session: { ...row, fresh: false }, user: await getUserOrDrop(row) };
}

async function getUserOrDrop(row: SessionRow): Promise<typeof users.$inferSelect | null> {
	const [user] = await db.select().from(users).where(eq(users.id, row.userId));
	if (!user) await db.delete(authSession).where(eq(authSession.id, row.id));
	return user ?? null;
}

export async function invalidateSession(sessionId: string): Promise<void> {
	await db.delete(authSession).where(eq(authSession.id, sessionId));
}

export async function invalidateUserSessions(userId: string): Promise<void> {
	await db.delete(authSession).where(eq(authSession.userId, userId));
}

/**
 * THE anonymous-swap invariant, concentrated: when a guest signs in (or up)
 * as a real account, kill the guest session they arrived on. This was
 * hand-copied at four login call sites; it now lives here and nowhere else.
 */
export async function invalidateStaleAnonymousSession(
	oldUser: { id: string; email?: string | null } | null | undefined,
	oldSessionId: string | null | undefined,
	newUserId: string,
	newSessionId: string | null | undefined
): Promise<void> {
	if (!oldUser || !oldSessionId) return;
	if (!isAnonymousAccount(oldUser)) return;
	if (oldUser.id === newUserId) return;
	if (newSessionId && oldSessionId === newSessionId) return;
	await invalidateSession(oldSessionId).catch(() => {});
}
