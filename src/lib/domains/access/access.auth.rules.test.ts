/**
 * The auth screens' pure rules: the redirect-code table, the landing and
 * sibling-link labels and both password checks in legacy's order.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	authErrorCopy,
	authLandingLabel,
	authSiblingHref,
	resetPasswordRefusal,
	signupPasswordRefusal
} from './access.auth.rules';

describe('authErrorCopy', () => {
	it.each([
		['missing_token', 'That invite link is incomplete. Open the link from your email again.'],
		['invalid_token', 'That invite link has expired or is invalid. Ask for a new invite.'],
		[
			'The token provided was not valid, please try again.',
			'The token provided was not valid, please try again.'
		],
		['Family joined. Sign in to continue.', 'Family joined. Sign in to continue.']
	])('maps %s to the copy the page shows', (raw, expected) => {
		expect(authErrorCopy(raw)).toBe(expected);
	});
});

describe('authLandingLabel', () => {
	it('names the calendar by name and any other target Continue', () => {
		expect(authLandingLabel('/calendar')).toBe('Go to Calendar');
		expect(authLandingLabel('/family/abc')).toBe('Continue');
	});
});

describe('authSiblingHref', () => {
	it('keeps a non-calendar target on the sibling link', () => {
		expect(authSiblingHref('/signup', '/calendar')).toBe('/signup');
		expect(authSiblingHref('/login', '/calendar')).toBe('/login');
		expect(authSiblingHref('/signup', '/family/abc')).toBe('/signup?redirect=%2Ffamily%2Fabc');
	});
});

describe('signupPasswordRefusal', () => {
	it.each([
		['secret12', 'secret13', 'Passwords do not match'],
		['short', 'short', 'Password must be at least 8 characters'],
		['', '', 'Password must be at least 8 characters'],
		['exactly8', 'exactly8', null]
	])('password %s / confirm %s answers %s', (password, confirm, expected) => {
		expect(signupPasswordRefusal(password, confirm)).toBe(expected);
	});

	it('names a mismatch before complaining about length', () => {
		expect(signupPasswordRefusal('short', 'different')).toBe('Passwords do not match');
	});
});

describe('resetPasswordRefusal', () => {
	it.each([
		['', 'anything', 'anything', 'Invalid reset token'],
		['tok', 'secret12', 'secret13', 'Passwords do not match'],
		['tok', 'short', 'short', 'Password must be at least 8 characters'],
		['tok', 'exactly8', 'exactly8', null]
	])('token %s with %s / %s answers %s', (token, password, confirm, expected) => {
		expect(resetPasswordRefusal(token, password, confirm)).toBe(expected);
	});

	it('refuses a missing token before looking at the passwords', () => {
		expect(resetPasswordRefusal('', 'short', 'different')).toBe('Invalid reset token');
	});
});
