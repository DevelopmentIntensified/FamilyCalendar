/**
 * Pure email-code rules: the type vocabulary (every kind stored as a keyed
 * digest, Q-116/Q-117), the fail-closed pepper fallback, the 15-minute TTL, the
 * expiry predicate and the `(hash, email, type)` lookup key. Expected values
 * come from `codes.ts`, `magicLink.ts`, `accountData.ts`, the verify routes and
 * the reset route's `used:<hash>` marker; the digest is RFC 4231 case 2's
 * HMAC-SHA-256 value, not this code's output.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '$lib/kernel/ids/ids';
import {
	CODE_PEPPER_PLACEHOLDER,
	EMAIL_CODE_TTL_MS,
	EMAIL_CODE_TYPES,
	emailCodeExpiresAt,
	emailCodeKey,
	HASHED_EMAIL_CODE_TYPES,
	isEmailCodeExpired,
	resolveCodePepper
} from './identity.code.rules';

const NOW = new Date('2026-01-15T12:00:00.000Z');

describe('vocabulary', () => {
	it('names every code kind a legacy writer stamps', () => {
		expect(EMAIL_CODE_TYPES).toEqual([
			'signup',
			'login',
			'password-signup',
			'email_change',
			'reset_used'
		]);
	});

	// Q-116 answered B: every kind a writer stamps is stored as a digest, the
	// email-change code and the reset marker included, so there is no plaintext
	// branch left to name.
	it.each<[string]>([
		['signup'],
		['login'],
		['password-signup'],
		['email_change'],
		['reset_used']
	])('lists %s among the kinds stored as a digest', (type) => {
		expect(HASHED_EMAIL_CODE_TYPES).toContain(type);
	});

	it('lists every kind as hashed — no kind keeps its value', () => {
		expect(HASHED_EMAIL_CODE_TYPES).toEqual([
			'signup',
			'login',
			'password-signup',
			'email_change',
			'reset_used'
		]);
		expect(HASHED_EMAIL_CODE_TYPES).toEqual(EMAIL_CODE_TYPES);
	});
});

describe('resolveCodePepper', () => {
	// Modeled on `resolveSessionSecret` (session.rules.ts:38-51): production
	// fails closed; elsewhere the placeholder keeps zero-env builds hashing
	// (`secret ?? placeholder`, so '' stays '').
	it.each<[string, string | undefined, boolean, string]>([
		['a configured pepper in production', 's3cret', true, 's3cret'],
		['a configured pepper elsewhere', 's3cret', false, 's3cret'],
		['no pepper outside production', undefined, false, CODE_PEPPER_PLACEHOLDER],
		['an empty pepper outside production', '', false, '']
	])('the placeholder pepper only in non-production: %s', (_label, secret, production, expected) => {
		expect(resolveCodePepper(secret, production)).toBe(expected);
	});

	it.each<[string, string | undefined]>([
		['no pepper', undefined],
		['an empty pepper', '']
	])('refuses to boot production with %s', (_label, secret) => {
		expect(() => resolveCodePepper(secret, true)).toThrow(
			'EMAILSECRET is required in production — refusing to store email codes with the placeholder pepper.'
		);
	});

	it('keeps the placeholder pepper the repo publishes', () => {
		expect(CODE_PEPPER_PLACEHOLDER).toBe('code-pepper-placeholder-change-me');
	});
});

describe('TTL and expiry', () => {
	// magicLink.ts:249 and accountData.ts:394: `Date.now() + 60 * 1000 * 15`.
	it('lives 15 minutes from issue', () => {
		expect(EMAIL_CODE_TTL_MS).toBe(15 * 60 * 1000);
		expect(emailCodeExpiresAt(NOW)).toEqual(new Date('2026-01-15T12:15:00.000Z'));
	});

	// codes.ts:80-82 `lt(expiresAt, now)` and verify-email `expiresAt < new Date()`.
	it.each<[string, Date, boolean]>([
		['expiring later', new Date('2026-01-15T12:00:00.001Z'), false],
		['expiring this very instant', NOW, false],
		['expired a millisecond ago', new Date('2026-01-15T11:59:59.999Z'), true]
	])('a code %s → expired %s', (_label, expiresAt, expected) => {
		expect(isEmailCodeExpired(expiresAt, NOW)).toBe(expected);
	});
});

describe('emailCodeKey', () => {
	// codes.ts:32-56: the lookup binds the keyed digest, the email AND the type,
	// so a digest match alone never redeems.
	it('hashes the code with the pepper and stamps its type (HMAC-SHA-256 hex)', () => {
		// RFC 4231 case 2: key "Jefe", data "what do ya want for nothing?".
		expect(
			emailCodeKey(
				{ code: 'what do ya want for nothing?', email: 'mia@example.com', type: 'login' },
				'Jefe'
			)
		).toEqual({
			codeHash: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
			email: 'mia@example.com',
			type: 'login'
		});
	});

	it('never carries the plaintext code', () => {
		const key = emailCodeKey(
			{ code: '24681357', email: 'mia@example.com', type: 'signup' },
			'pepper'
		);
		expect(Object.values(key)).not.toContain('24681357');
		expect(key.codeHash).toMatch(/^[0-9a-f]{64}$/);
	});

	// Q-117: the pepper is the whole defence for a 6–8 digit code, so a row
	// hashed under another pepper — or with a bare SHA-256 — never matches.
	it('keys the digest: another pepper or a bare SHA-256 answers a different hash', () => {
		const input = { code: '24681357', email: 'mia@example.com', type: 'signup' };
		const withA = emailCodeKey(input, 'pepper-a');
		const withB = emailCodeKey(input, 'pepper-b');
		expect(withA.codeHash).not.toBe(withB.codeHash);
		expect(withA.codeHash).not.toBe(sha256Hex('24681357'));
	});
});
