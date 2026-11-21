/**
 * Pure Claim rules for access: the token shape (32 random bytes, only the
 * SHA-256 stored, 15-minute TTL), the address coercion and dot rule, the
 * guests-only refusal and the email-copy variant that keeps the answer
 * uniform. Evidence: `claimService.ts:6-48`, `claimRequest.ts:46-85`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	CLAIM_TOKEN_BYTES,
	CLAIM_TOKEN_HASH_PATTERN,
	CLAIM_TOKEN_TTL_MS,
	claimEmail,
	claimEmailVariant,
	claimRequestRefusal,
	claimTokenExpiry,
	claimTokenHash,
	isClaimEmail
} from './access.claim.rules';
import { GUEST_EMAIL_SUFFIX } from './access.person.rules';

describe('the Claim token shape', () => {
	it('is 32 random bytes with the 15-minute TTL', () => {
		expect(CLAIM_TOKEN_BYTES).toBe(32);
		expect(CLAIM_TOKEN_TTL_MS).toBe(15 * 60 * 1000);
	});

	it('hashes to lowercase sha256 hex and never stores the token', () => {
		expect(claimTokenHash('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
		expect(claimTokenHash('abc')).toMatch(CLAIM_TOKEN_HASH_PATTERN);
		expect(claimTokenHash('abc')).not.toBe(claimTokenHash('abd'));
	});

	it('expires exactly 15 minutes after the caller-supplied now', () => {
		const now = new Date('2026-03-02T09:00:00.000Z');
		expect(claimTokenExpiry(now).toISOString()).toBe('2026-03-02T09:15:00.000Z');
		expect(now.toISOString()).toBe('2026-03-02T09:00:00.000Z');
	});
});

describe('claimEmail', () => {
	it.each<[unknown, string]>([
		[42, ''],
		[null, ''],
		[undefined, ''],
		[{}, ''],
		['  Mia@Example.TEST ', 'mia@example.test']
	])('reads %j as %j', (raw, expected) => {
		expect(claimEmail(raw)).toBe(expected);
	});
});

describe('isClaimEmail', () => {
	it.each<[string, boolean]>([
		['mia@example.test', true],
		['a@b.c', true],
		['nope', false],
		['a@b', false],
		['a b@c.test', false],
		['', false]
	])('reads %j as %s', (email, expected) => {
		expect(isClaimEmail(email)).toBe(expected);
	});
});

describe('claimRequestRefusal', () => {
	const guest = { email: `guest-1${GUEST_EMAIL_SUFFIX}` };

	it('refuses a registered person before reading the address', () => {
		expect(claimRequestRefusal({ email: 'owner@example.test' }, 'nope')).toBe(
			'already-has-email'
		);
	});

	it.each<[string, unknown]>([
		['an absent address', undefined],
		['a non-string address', 42],
		['an address without a dot', 'nope']
	])('refuses a guest with %s', (_label, raw) => {
		expect(claimRequestRefusal(guest, raw)).toBe('invalid-email');
	});

	it('allows a guest at a fresh, well-formed address', () => {
		expect(claimRequestRefusal(guest, 'fresh@example.test')).toBeNull();
	});
});

describe('claimEmailVariant', () => {
	it('only the email copy differs for a registered address', () => {
		expect(claimEmailVariant(false)).toBe('save');
		expect(claimEmailVariant(true)).toBe('merge');
	});
});
