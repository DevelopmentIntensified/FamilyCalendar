import { describe, it, expect, vi } from 'vitest';
import type * as AuthModule from './auth';

// Real module (no db calls needed): only the cookie/token helpers are
// exercised. Dummy URL + migrations off keep the db import side-effect free.
vi.hoisted(() => {
	process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5433/familycalendar_test';
	process.env.DATABASE_DISABLE_MIGRATIONS = '1';
});

/** Import auth fresh under the given secret: SESSION_SECRET is read once at
 * module import, so each secret needs its own module instance — the scheme is
 * per-process by design (a deploy with a new secret invalidates all cookies).
 * Dynamic import is the point of this test seam: a static import pins exactly
 * one module instance, so it cannot observe the import-time env semantics. */
async function loadAuth(secret: string | undefined): Promise<typeof AuthModule> {
	vi.resetModules();
	const previous = process.env.BETTER_AUTH_SECRET;
	if (secret === undefined) delete process.env.BETTER_AUTH_SECRET;
	else process.env.BETTER_AUTH_SECRET = secret;
	try {
		return await import('./auth');
	} finally {
		if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
		else process.env.BETTER_AUTH_SECRET = previous;
	}
}

describe('session token cookie (better-auth signed scheme)', () => {
	it('returns raw signed value — no percent encoding (kit cookies.set encodes once on the wire)', async () => {
		const { sessionCookieValue, unsignSessionToken } = await loadAuth('unit-test-secret-key-material');
		const value = sessionCookieValue('tok-123');
		// Contract fix 2026-10-22: the value must be better-auth's raw signed
		// scheme `token.hmacSHA256(token)`. Kit's cookies.set does the one URL
		// encoding and cookies.get does the one decode, so a module-level
		// encodeURIComponent double-encoded the wire value (%2B → %252B) and
		// every second-leg request failed unsign → anonymous → /login bounce.
		// RED first at 89-char encodings seen from prod; green post-fix.
		expect(value).not.toContain('%');
		expect(value.startsWith('tok-123.')).toBe(true);
		expect(unsignSessionToken(value)).toBe('tok-123');
	});

	it('signs and round-trips a token', async () => {
		const { sessionCookieValue, unsignSessionToken } = await loadAuth('unit-test-secret-key-material');
		const value = sessionCookieValue('tok-123');

		// token.signature, URL-encoded; signature validates back to the token.
		expect(value.startsWith(encodeURIComponent('tok-123.'))).toBe(true);
		expect(unsignSessionToken(decodeURIComponent(value))).toBe('tok-123');
	});

	it('rejects a tampered payload and a wrong-key signature', async () => {
		const { sessionCookieValue, unsignSessionToken } = await loadAuth('unit-test-secret-key-material');
		const value = decodeURIComponent(sessionCookieValue('tok-123'));

		expect(unsignSessionToken(value.replace('tok-123', 'tok-999'))).toBeNull();
		expect(unsignSessionToken('tok-123')).toBeNull();
		expect(unsignSessionToken(`${value}x`)).toBeNull();
	});

	it('does not verify a signature minted under a different secret', async () => {
		const a = await loadAuth('secret-A');
		const value = decodeURIComponent(a.sessionCookieValue('tok-123'));
		expect(a.unsignSessionToken(value)).toBe('tok-123');

		// A fresh process (module instance) with a different secret rejects it.
		const b = await loadAuth('secret-B');
		expect(b.unsignSessionToken(value)).toBeNull();
	});

	it('falls back to the placeholder secret so zero-env builds work', async () => {
		const { sessionCookieValue, unsignSessionToken } = await loadAuth(undefined);
		expect(
			process.env.BETTER_AUTH_SECRET,
			'the test must not leak a secret while exercising the fallback'
		).toBe(undefined);

		const value = decodeURIComponent(sessionCookieValue('tok-123'));
		expect(unsignSessionToken(value)).toBe('tok-123');
		expect(value).toBe(decodeURIComponent(sessionCookieValue('tok-123')));
	});

	it('builds better-auth default cookie shapes (live + blank)', async () => {
		const { createSessionCookie, createBlankSessionCookie, sessionCookieName } = await loadAuth(
			'unit-test-secret-key-material'
		);

		const live = await createSessionCookie({ token: 'tok-123' });
		expect(live.name).toBe(sessionCookieName);
		expect(live.attributes).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax' });
		expect(live.serialize()).toContain(`${sessionCookieName}=`);
		expect(live.serialize()).toContain('Max-Age=' + 90 * 24 * 60 * 60);

		const blank = createBlankSessionCookie();
		expect(blank.name).toBe(sessionCookieName);
		expect(blank.value).toBe('');
		expect(blank.serialize()).toContain('Max-Age=0');
	});
});
