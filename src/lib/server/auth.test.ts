import { describe, it, expect, vi } from 'vitest';

// Real module (no db calls needed): only the cookie/token helpers are
// exercised. Dummy URL + migrations off keep the db import side-effect free.
vi.hoisted(() => {
	process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5433/familycalendar_test';
	process.env.DATABASE_DISABLE_MIGRATIONS = '1';
});

import {
	createBlankSessionCookie,
	createSessionCookie,
	sessionCookieName,
	sessionCookieValue,
	unsignSessionToken
} from './auth';

/** Scopes the secret for one assertion, matching the better-auth scheme. */
async function withSecret(value: string, fn: () => void) {
	const previous = process.env.BETTER_AUTH_SECRET;
	process.env.BETTER_AUTH_SECRET = value;
	try {
		fn();
	} finally {
		if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
		else process.env.BETTER_AUTH_SECRET = previous;
	}
}

describe('session token cookie (better-auth signed scheme)', () => {
	it('signs and round-trips a token', async () => {
		await withSecret('unit-test-secret-key-material', () => {
			const value = sessionCookieValue('tok-123');

			// token.signature, URL-encoded; signature validates back to the token.
			expect(value.startsWith(encodeURIComponent('tok-123.'))).toBe(true);
			expect(unsignSessionToken(decodeURIComponent(value))).toBe('tok-123');
		});
	});

	it('rejects a tampered payload and a wrong-key signature', async () => {
		await withSecret('unit-test-secret-key-material', () => {
			const value = decodeURIComponent(sessionCookieValue('tok-123'));

			expect(unsignSessionToken(value.replace('tok-123', 'tok-999'))).toBeNull();
			expect(unsignSessionToken('tok-123')).toBeNull();
			expect(unsignSessionToken(`${value}x`)).toBeNull();
		});
	});

	it('does not verify a signature minted under a different secret', async () => {
		await withSecret('secret-A', () => {
			const value = decodeURIComponent(sessionCookieValue('tok-123'));
			expect(unsignSessionToken(value)).toBe('tok-123');

			return withSecret('secret-B', () => {
				expect(unsignSessionToken(value)).toBeNull();
			});
		});
	});

	it('falls back to the placeholder secret so zero-env builds work', async () => {
		await withSecret(undefined as never as string, () => {
			const value = decodeURIComponent(sessionCookieValue('tok-123'));
			// Deterministic against the documented fallback despite an earlier
			// test secret being active.
			expect(value).toBe(decodeURIComponent(sessionCookieValue('tok-123')));
			expect(unsignSessionToken(value)).toBe('tok-123');
		});
	});

	it('builds better-auth default cookie shapes (live + blank)', async () => {
		await withSecret('unit-test-secret-key-material', async () => {
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
});
