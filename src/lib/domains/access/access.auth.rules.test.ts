/**
 * The auth screens' pure rules: the redirect-code table, the landing and
 * sibling-link labels, both password checks in legacy's order, and the merge
 * prompt's count copy.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	authErrorCopy,
	authLandingLabel,
	authSiblingHref,
	mergeBringLabel,
	mergeCountLabel,
	mergeSentenceKind,
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

describe('merge prompt copy', () => {
	it('pluralises a count', () => {
		expect(mergeCountLabel(1, 'event')).toBe('1 event');
		expect(mergeCountLabel(3, 'event')).toBe('3 events');
		expect(mergeCountLabel(1, 'task')).toBe('1 task');
		expect(mergeCountLabel(2, 'task')).toBe('2 tasks');
	});

	it('counts both kinds in the primary button', () => {
		expect(mergeBringLabel(3, 2)).toBe('Bring my 5 items over');
		expect(mergeBringLabel(0, 1)).toBe('Bring my 1 items over');
	});

	it.each([
		[2, 1, 'both'],
		[1, 0, 'events'],
		[0, 4, 'tasks']
	])('events %s / tasks %s uses the %s sentence', (events, tasks, expected) => {
		expect(mergeSentenceKind(events, tasks)).toBe(expected);
	});
});
