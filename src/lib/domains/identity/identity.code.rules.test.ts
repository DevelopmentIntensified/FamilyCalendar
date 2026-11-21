/**
 * Pure email-code rules: the type vocabulary (every kind stored as a digest,
 * Q-116), the 15-minute TTL, the expiry predicate and the `(hash, email, type)`
 * lookup key. Expected values come from `codes.ts`, `magicLink.ts`,
 * `accountData.ts`, the verify routes and the reset route's `used:<hash>`
 * marker; the digest is the NIST SHA-256 test vector, not this code's output.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	EMAIL_CODE_TTL_MS,
	EMAIL_CODE_TYPES,
	emailCodeExpiresAt,
	emailCodeKey,
	HASHED_EMAIL_CODE_TYPES,
	isEmailCodeExpired
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
	// codes.ts:32-56: the lookup binds the digest, the email AND the type, so
	// a digest match alone never redeems.
	it('hashes the code and stamps its type (SHA-256 hex; email and type as given)', () => {
		expect(emailCodeKey({ code: 'abc', email: 'mia@example.com', type: 'login' })).toEqual({
			codeHash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
			email: 'mia@example.com',
			type: 'login'
		});
	});

	it('never carries the plaintext code', () => {
		const key = emailCodeKey({ code: '24681357', email: 'mia@example.com', type: 'signup' });
		expect(Object.values(key)).not.toContain('24681357');
		expect(key.codeHash).toMatch(/^[0-9a-f]{64}$/);
	});
});
