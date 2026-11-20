/**
 * identity session rules: better-auth's session cookie (name, attribute
 * policy, raw `token.signature` value and its shape check, the Set-Cookie
 * header), the 90-day sliding lifetime renewed at most once a day, and the
 * signing-secret fallback.
 *
 * Pure: "now" and "production" are parameters (R5/R6). Computing the HMAC and
 * comparing it in constant time (`timingSafeEqual`) need node:crypto and stay
 * in the session service, exactly where legacy had them (`auth.ts:60-81`).
 *
 * Doc: ./README.md#invariants
 */

/** better-auth's default session cookie. */
export const SESSION_COOKIE_NAME = 'better-auth.session_token';

/** 90 days, sliding. */
export const SESSION_LIFETIME_SECONDS = 90 * 24 * 60 * 60;

/** A session's expiry rolls forward at most once per day of use. */
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

/** `authSession.id` length (kernel ids). */
export const SESSION_ID_LENGTH = 15;

/** `authSession.token` length (kernel ids); the cookie carries it signed. */
export const SESSION_TOKEN_LENGTH = 32;

/**
 * The key a zero-env build signs with. Public knowledge (it is in the repo),
 * so production never uses it.
 */
export const SESSION_SECRET_PLACEHOLDER = 'better-auth-placeholder-secret-change-me';

/** HMAC-SHA256 as standard base64: 44 chars, `=`-padded. */
const SIGNATURE_LENGTH = 44;

/**
 * The signing secret. Production without `BETTER_AUTH_SECRET` fails closed at
 * boot; elsewhere the placeholder keeps `npm run build` working with no env.
 * Legacy `secret ?? placeholder`: an empty secret outside production is used
 * as-is (`auth.ts:38-51`).
 */
export function resolveSessionSecret(secret: string | undefined, production: boolean): string {
	if (!secret && production) {
		throw new Error(
			'BETTER_AUTH_SECRET is required in production — refusing to sign sessions with the placeholder key.'
		);
	}
	return secret ?? SESSION_SECRET_PLACEHOLDER;
}

/**
 * The cookie VALUE: raw `token.signature`, never URL-encoded here. SvelteKit's
 * `cookies.set` encodes once on the wire and `cookies.get` decodes once; an
 * extra layer double-encoded `+` (%2B → %252B) and signed everyone out (#196).
 */
export function signedSessionCookieValue(token: string, signature: string): string {
	return `${token}.${signature}`;
}

/**
 * Splits a cookie value at the LAST dot into token and signature, or null when
 * the shape cannot be a signed session (no token, or a signature that is not
 * 44 chars ending in `=`). Whether the signature MATCHES is the service's
 * constant-time check.
 */
export function splitSignedSessionCookie(
	value: string
): { readonly token: string; readonly signature: string } | null {
	const dot = value.lastIndexOf('.');
	if (dot < 1) return null;
	const signature = value.slice(dot + 1);
	if (signature.length !== SIGNATURE_LENGTH || !signature.endsWith('=')) return null;
	return { token: value.slice(0, dot), signature };
}

/** The attribute policy every session cookie shares. */
export type SessionCookieAttributes = {
	readonly path: '/';
	readonly httpOnly: true;
	readonly sameSite: 'lax';
	readonly secure: boolean;
	readonly maxAge?: number;
	readonly expires?: Date;
};

/** `path=/`, `httpOnly`, `sameSite=lax`; `secure` only in production. */
export function sessionCookieAttributes(production: boolean): SessionCookieAttributes {
	return { path: '/', httpOnly: true, sameSite: 'lax', secure: production };
}

/** A live session cookie: the full 90-day max age. */
export function liveSessionCookieAttributes(production: boolean): SessionCookieAttributes {
	return { ...sessionCookieAttributes(production), maxAge: SESSION_LIFETIME_SECONDS };
}

/** better-auth's expireCookie: an empty value, already expired. */
export function blankSessionCookieAttributes(production: boolean): SessionCookieAttributes {
	return { ...sessionCookieAttributes(production), maxAge: 0, expires: new Date(0) };
}

/**
 * The `Set-Cookie` header for a JSON response that cannot use kit's cookie
 * API (the mobile and email-code sign-ins). The header is raw, so the value is
 * URL-encoded here, exactly once (`auth.ts:99-110`).
 */
export function sessionSetCookieHeader(
	value: string,
	maxAgeSeconds: number,
	now: Date,
	production: boolean
): string {
	const parts = [
		`${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
		'Path=/',
		`Max-Age=${maxAgeSeconds}`,
		`Expires=${new Date(now.getTime() + maxAgeSeconds * 1000).toUTCString()}`,
		'HttpOnly',
		'SameSite=Lax'
	];
	if (production) parts.push('Secure');
	return parts.join('; ');
}

/** The expiry a new or renewed session gets. */
export function sessionExpiresAt(now: Date): Date {
	return new Date(now.getTime() + SESSION_LIFETIME_SECONDS * 1000);
}

/** Expired strictly before `now`; such a row is deleted on validation. */
export function isSessionExpired(expiresAt: Date, now: Date): boolean {
	return expiresAt.getTime() < now.getTime();
}

/** Strictly more than a day since the last roll (`auth.ts:190`). */
export function sessionRenewalDue(updatedAt: Date, now: Date): boolean {
	return now.getTime() - updatedAt.getTime() > SESSION_UPDATE_AGE_SECONDS * 1000;
}
