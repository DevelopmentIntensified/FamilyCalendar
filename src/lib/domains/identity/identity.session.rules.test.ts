/**
 * Pure session rules: the cookie name and attribute policy, the raw signed
 * value and its shape check, the Set-Cookie header, the 90-day sliding
 * lifetime with its once-a-day renewal, and the secret fallback. HMAC and the
 * constant-time compare are node:crypto and stay in the session service.
 * Expected values come from `src/lib/server/auth.ts` and `auth.test.ts`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	blankSessionCookieAttributes,
	isSessionExpired,
	liveSessionCookieAttributes,
	resolveSessionSecret,
	SESSION_COOKIE_NAME,
	SESSION_ID_LENGTH,
	SESSION_LIFETIME_SECONDS,
	SESSION_SECRET_PLACEHOLDER,
	SESSION_TOKEN_LENGTH,
	SESSION_UPDATE_AGE_SECONDS,
	sessionCookieAttributes,
	sessionExpiresAt,
	sessionRenewalDue,
	sessionSetCookieHeader,
	signedSessionCookieValue,
	splitSignedSessionCookie
} from './identity.session.rules';

/** A 44-char standard-base64 HMAC-SHA256 shape, with the characters a URL encoder would touch. */
const SIGNATURE = `ab+/${'A'.repeat(39)}=`;

const NOW = new Date('2026-01-15T12:00:00.000Z');

describe('constants', () => {
	it('keeps the better-auth cookie and the 90-day sliding lifetime', () => {
		expect(SESSION_COOKIE_NAME).toBe('better-auth.session_token');
		expect(SESSION_LIFETIME_SECONDS).toBe(90 * 24 * 60 * 60);
		expect(SESSION_UPDATE_AGE_SECONDS).toBe(24 * 60 * 60);
		expect([SESSION_ID_LENGTH, SESSION_TOKEN_LENGTH]).toEqual([15, 32]);
		expect(SIGNATURE).toHaveLength(44);
	});
});

describe('resolveSessionSecret', () => {
	// auth.ts:38-51: production fails closed; elsewhere the placeholder keeps
	// zero-env builds signing (`secret ?? placeholder`, so '' stays '').
	it.each<[string, string | undefined, boolean, string]>([
		['a configured secret in production', 's3cret', true, 's3cret'],
		['a configured secret elsewhere', 's3cret', false, 's3cret'],
		['no secret outside production', undefined, false, SESSION_SECRET_PLACEHOLDER],
		['an empty secret outside production', '', false, '']
	])('the placeholder secret only in non-production: %s', (_label, secret, production, expected) => {
		expect(resolveSessionSecret(secret, production)).toBe(expected);
	});

	it.each<[string, string | undefined]>([
		['no secret', undefined],
		['an empty secret', '']
	])('refuses to boot production with %s', (_label, secret) => {
		expect(() => resolveSessionSecret(secret, true)).toThrow(
			'BETTER_AUTH_SECRET is required in production — refusing to sign sessions with the placeholder key.'
		);
	});

	it('keeps the placeholder key the repo has always published', () => {
		expect(SESSION_SECRET_PLACEHOLDER).toBe('better-auth-placeholder-secret-change-me');
	});
});

describe('signed cookie value', () => {
	// auth.test.ts:29-44 (#196 double-encode outage): the value is RAW
	// `token.signature`; SvelteKit's cookies.set encodes it once on the wire.
	it('signs token.signature without URL encoding (kit encodes once)', () => {
		const value = signedSessionCookieValue('tok-123', SIGNATURE);
		expect(value).toBe(`tok-123.${SIGNATURE}`);
		expect(value).not.toContain('%');
	});

	it('splits a well-formed value at the LAST dot', () => {
		expect(splitSignedSessionCookie(`tok-123.${SIGNATURE}`)).toEqual({
			token: 'tok-123',
			signature: SIGNATURE
		});
		expect(splitSignedSessionCookie(`a.b.${SIGNATURE}`)).toEqual({
			token: 'a.b',
			signature: SIGNATURE
		});
	});

	// auth.ts:66-75 and auth.test.ts:46-54.
	it.each<[string, string]>([
		['no dot at all', 'tok-123'],
		['an empty token', `.${SIGNATURE}`],
		['a signature one character too long', `tok-123.${SIGNATURE}x`],
		['a short signature', `tok-123.${SIGNATURE.slice(1)}`],
		['a 44-char signature without padding', `tok-123.${'A'.repeat(44)}`],
		['an empty value', '']
	])('rejects a malformed, short or tampered signature: %s', (_label, value) => {
		expect(splitSignedSessionCookie(value)).toBeNull();
	});
});

describe('cookie attributes', () => {
	// auth.ts:91-132 and auth.test.ts:77-93.
	it('builds the better-auth cookie attributes and the blank cookie', () => {
		expect(sessionCookieAttributes(false)).toEqual({
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false
		});
		expect(liveSessionCookieAttributes(true)).toEqual({
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
			maxAge: 7776000
		});
		expect(blankSessionCookieAttributes(false)).toEqual({
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false,
			maxAge: 0,
			expires: new Date(0)
		});
	});

	it('serializes the live Set-Cookie header with the value encoded exactly once', () => {
		expect(
			sessionSetCookieHeader(`tok-123.${SIGNATURE}`, SESSION_LIFETIME_SECONDS, NOW, false)
		).toBe(
			`better-auth.session_token=tok-123.ab%2B%2F${'A'.repeat(39)}%3D; Path=/; Max-Age=7776000; ` +
				'Expires=Wed, 15 Apr 2026 12:00:00 GMT; HttpOnly; SameSite=Lax'
		);
	});

	it('serializes the blank Set-Cookie header, Secure only in production', () => {
		expect(sessionSetCookieHeader('', 0, NOW, true)).toBe(
			'better-auth.session_token=; Path=/; Max-Age=0; Expires=Thu, 15 Jan 2026 12:00:00 GMT; ' +
				'HttpOnly; SameSite=Lax; Secure'
		);
	});
});

describe('lifetime and renewal', () => {
	it('expires a new or renewed session 90 days from now', () => {
		expect(sessionExpiresAt(NOW)).toEqual(new Date('2026-04-15T12:00:00.000Z'));
	});

	// auth.ts:186: `row.expiresAt < new Date()`.
	it.each<[string, Date, boolean]>([
		['expiring later', new Date('2026-01-15T12:00:00.001Z'), false],
		['expiring this very instant', NOW, false],
		['expired a millisecond ago', new Date('2026-01-15T11:59:59.999Z'), true]
	])('a session %s → expired %s', (_label, expiresAt, expected) => {
		expect(isSessionExpired(expiresAt, NOW)).toBe(expected);
	});

	// auth.ts:190: `Date.now() - row.updatedAt > SESSION_UPDATE_AGE_SECONDS * 1000`.
	it.each<[string, Date, boolean]>([
		['an hour ago', new Date('2026-01-15T11:00:00.000Z'), false],
		['exactly a day ago', new Date('2026-01-14T12:00:00.000Z'), false],
		['a day and a millisecond ago', new Date('2026-01-14T11:59:59.999Z'), true]
	])('a session last rolled %s → renewal due %s', (_label, updatedAt, expected) => {
		expect(sessionRenewalDue(updatedAt, NOW)).toBe(expected);
	});
});
