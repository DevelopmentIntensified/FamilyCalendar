/**
 * Pure password rules for access: the four-field signup check, the reset
 * check and the durable single-use marker's prefix. Copy and order come from
 * the legacy handlers (`passwordSignup.ts:70-76`,
 * `forgot-password/reset/+server.ts:70-80,101`); the wire strings live in the
 * contract, so a refusal is a reason here, not a sentence.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	PASSWORD_MIN_LENGTH,
	passwordResetRefusal,
	passwordSignupRefusal,
	resetUsedMarker,
	type PasswordRefusal,
	type PasswordResetFields,
	type PasswordSignupFields
} from './access.password.rules';

const SIGNUP = {
	email: 'mia@example.test',
	password: 'correct-horse-battery',
	firstName: 'Mia',
	lastName: 'Lopez'
};

describe('passwordSignupRefusal', () => {
	it('keeps the 8-character floor', () => {
		expect(PASSWORD_MIN_LENGTH).toBe(8);
	});

	it('accepts the complete form', () => {
		expect(passwordSignupRefusal(SIGNUP)).toBeNull();
	});

	it.each<[string, PasswordSignupFields]>([
		['an absent email', { ...SIGNUP, email: '' }],
		['an absent password', { ...SIGNUP, password: '' }],
		['an absent first name', { ...SIGNUP, firstName: '' }],
		['an absent last name', { ...SIGNUP, lastName: '' }]
	])('refuses %s before looking at the password length', (_label, fields) => {
		expect(passwordSignupRefusal(fields)).toBe('missing-fields');
	});

	it.each<[string, string, PasswordRefusal | null]>([
		['seven characters', '1234567', 'short-password'],
		['exactly eight', '12345678', null],
		['nine', '123456789', null],
		// Legacy measures UTF-16 units (`password.length`), not code points.
		['eight accented letters', 'éééééééé', null]
	])('reads %s as %s', (_label, password, expected) => {
		expect(passwordSignupRefusal({ ...SIGNUP, password })).toBe(expected);
	});
});

describe('passwordResetRefusal', () => {
	it('accepts a token with a long enough password', () => {
		expect(passwordResetRefusal({ token: 'a.jwt', password: 'long-enough' })).toBeNull();
	});

	it.each<[string, PasswordResetFields]>([
		['no token', { token: '', password: 'long-enough' }],
		['no password', { token: 'a.jwt', password: '' }],
		['neither', { token: '', password: '' }]
	])('refuses %s as missing fields', (_label, fields) => {
		expect(passwordResetRefusal(fields)).toBe('missing-fields');
	});

	it('checks the length only once both fields are present', () => {
		expect(passwordResetRefusal({ token: 'a.jwt', password: 'short' })).toBe('short-password');
		expect(passwordResetRefusal({ token: '', password: 'short' })).toBe('missing-fields');
	});
});

describe('resetUsedMarker', () => {
	it('prefixes the stored token hash', () => {
		expect(resetUsedMarker('ab12')).toBe('used:ab12');
	});
});
