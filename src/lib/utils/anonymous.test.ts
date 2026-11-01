import { describe, it, expect } from 'vitest';
import { ANONYMOUS_EMAIL_DOMAIN, isAnonymousAccount, isRegisteredAccount } from './anonymous';

describe('isRegisteredAccount (#241)', () => {
	it.each([
		[null, false],
		[undefined, false],
		[{ email: null }, false],
		[{ email: '' }, false],
		[{ email: `abc${ANONYMOUS_EMAIL_DOMAIN}` }, false],
		[{ email: 'real@user.com' }, true]
	])('%j -> %s', (user, expected) => {
		expect(isRegisteredAccount(user)).toBe(expected);
	});

	it('is never true for an Anonymous Account', () => {
		const guest = { email: `x${ANONYMOUS_EMAIL_DOMAIN}` };
		expect(isAnonymousAccount(guest)).toBe(true);
		expect(isRegisteredAccount(guest)).toBe(false);
	});
});
