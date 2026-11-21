/**
 * Pure email/link rules for access: the kind tag, the 8-digit code shape, the
 * TTLs, the gate keys and callback paths, the signed-payload readers.
 *
 * Carried from the legacy pure suite (`src/lib/server/services/magicLink.test.ts`):
 * kind mismatch (`:430`), legacy tokens without a kind tag (`:438`), a payload
 * that does not fit its kind (`:446`), a non-string `redirectTo` claim ignored
 * (`:569`), and the gate key / callback path table (`:67-96`). TTLs come from
 * `magicLink.ts:230-232` and `forgot-password/+server.ts:67-72`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	EMAIL_CODE_LENGTH,
	emailCodeExpiry,
	LINK_CODE_TTL_MS,
	magicLinkCallbackPath,
	magicLinkGateKey,
	MAGIC_LINK_KINDS,
	readMagicLinkPayload,
	readResetTokenPayload,
	RESET_LINK_TTL_MS,
	resetTokenExpiry,
	isEightDigitCode,
	type MagicLinkKind
} from './access.email.rules';

describe('link vocabulary and timing', () => {
	it('mints only the two kind-tagged links', () => {
		expect(MAGIC_LINK_KINDS).toEqual(['login', 'signup']);
	});

	it('keeps the 15-minute code/link window and the 60-minute reset window', () => {
		expect(LINK_CODE_TTL_MS).toBe(15 * 60 * 1000);
		expect(RESET_LINK_TTL_MS).toBe(60 * 60 * 1000);
		expect(EMAIL_CODE_LENGTH).toBe(8);
	});

	it('adds the window to the caller-supplied now', () => {
		const now = new Date('2026-03-02T09:00:00.000Z');
		expect(emailCodeExpiry(now).toISOString()).toBe('2026-03-02T09:15:00.000Z');
		expect(resetTokenExpiry(now).toISOString()).toBe('2026-03-02T10:00:00.000Z');
		// The rule never mutates its input.
		expect(now.toISOString()).toBe('2026-03-02T09:00:00.000Z');
	});

	it.each<[string, boolean]>([
		['12345678', true],
		['00000000', true],
		['1234567', false],
		['123456789', false],
		['abcdefgh', false],
		['1234 5678', false],
		['', false]
	])('isEightDigitCode(%j) -> %s', (code, expected) => {
		expect(isEightDigitCode(code)).toBe(expected);
	});
});

describe('gate keys and callback paths', () => {
	it.each<[MagicLinkKind, string, string]>([
		['signup', 'signup-code:new@user.com', '/signup/email/callback'],
		['login', 'login-code:new@user.com', '/login/email/callback']
	])('[%s] keys and lands on the web route', (kind, gateKey, callbackPath) => {
		expect(magicLinkGateKey(kind, 'New@User.com')).toBe(gateKey);
		expect(magicLinkCallbackPath(kind)).toBe(callbackPath);
	});
});

describe('readMagicLinkPayload', () => {
	const loginPayload = {
		kind: 'login',
		email: 'new@user.com',
		code: '13572468'
	};

	it('reads a login payload without names or a redirect', () => {
		expect(readMagicLinkPayload(loginPayload, 'login')).toEqual({
			ok: true,
			payload: { kind: 'login', email: 'new@user.com', code: '13572468' }
		});
	});

	it('reads a signup payload with its names and a string redirect', () => {
		expect(
			readMagicLinkPayload(
				{
					kind: 'signup',
					email: 'new@user.com',
					firstName: 'New',
					lastName: 'User',
					code: '13572468',
					redirectTo: '/family/join/ABC123'
				},
				'signup'
			)
		).toEqual({
			ok: true,
			payload: {
				kind: 'signup',
				email: 'new@user.com',
				firstName: 'New',
				lastName: 'User',
				code: '13572468',
				redirectTo: '/family/join/ABC123'
			}
		});
	});

	it('refuses a link minted for another kind', () => {
		expect(readMagicLinkPayload(loginPayload, 'signup')).toEqual({
			ok: false,
			reason: 'kind-mismatch'
		});
	});

	it('refuses a token without a kind tag (the legacy shape)', () => {
		expect(
			readMagicLinkPayload({ email: 'new@user.com', code: '13572468' }, 'login')
		).toEqual({ ok: false, reason: 'kind-mismatch' });
	});

	it.each<[unknown]>([
		[null],
		[[1, 2]],
		['token'],
		[{ kind: 'claim', email: 'a@b.com', code: '13572468' }],
		[{ kind: 'login', email: '', code: '13572468' }],
		[{ kind: 'login', code: '13572468' }],
		[{ kind: 'login', email: 'a@b.com', code: '' }],
		[{ kind: 'login', email: 'a@b.com' }]
	])('refuses an invalid login payload %j', (payload) => {
		expect(readMagicLinkPayload(payload, 'login')).toEqual({ ok: false, reason: 'invalid' });
	});

	it.each<[unknown]>([
		[{ kind: 'signup', email: 'a@b.com', code: '13572468' }],
		[{ kind: 'signup', email: 'a@b.com', code: '13572468', firstName: 'New' }],
		[{ kind: 'signup', email: 'a@b.com', code: '13572468', firstName: 'New', lastName: '' }],
		[{ kind: 'signup', email: 'a@b.com', code: '13572468', firstName: '', lastName: 'User' }]
	])('refuses a signup payload without both names %j', (payload) => {
		expect(readMagicLinkPayload(payload, 'signup')).toEqual({ ok: false, reason: 'invalid' });
	});

	it('ignores a non-string redirectTo claim', () => {
		const result = readMagicLinkPayload({ ...loginPayload, redirectTo: 42 }, 'login');
		expect(result).toEqual({
			ok: true,
			payload: { kind: 'login', email: 'new@user.com', code: '13572468' }
		});
	});
});

describe('readResetTokenPayload', () => {
	it('reads the email claim a reset JWT carries', () => {
		expect(readResetTokenPayload({ purpose: 'password_reset', email: 'reset@example.test' })).toEqual(
			{ email: 'reset@example.test' }
		);
	});

	it('accepts an empty email claim: the account lookup refuses it, not the shape', () => {
		expect(readResetTokenPayload({ purpose: 'password_reset', email: '' })).toEqual({ email: '' });
	});

	// Q-102 B: the purpose claim is what makes a token a reset token. A sign-in
	// link carries the same `email` claim and no purpose, so it is refused.
	it.each<[string, unknown]>([
		['a sign-in link payload', { kind: 'login', email: 'reset@example.test', code: '13572468' }],
		['an email claim with no purpose', { email: 'reset@example.test' }],
		['another purpose', { purpose: 'sign_in', email: 'reset@example.test' }],
		['a non-string purpose', { purpose: 7, email: 'reset@example.test' }]
	])('refuses %s', (_label, payload) => {
		expect(readResetTokenPayload(payload)).toBeNull();
	});

	it.each<[unknown]>([[null], [[1]], ['jwt'], [{}], [{ code: '12345678' }], [{ email: 42 }]])(
		'refuses %j',
		(payload) => {
			expect(readResetTokenPayload(payload)).toBeNull();
		}
	);
});
