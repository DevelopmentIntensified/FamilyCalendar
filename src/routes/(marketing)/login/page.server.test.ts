import { describe, it, expect } from 'vitest';
import { load as loginLoad } from './+page.server';
import { load as signupLoad } from '../signup/+page.server';

// SAFETY: test double — both loads read only locals.user and url.
const ev = (user: { id: string; email: string } | null) =>
	({ locals: { user }, url: new URL('http://test.com/login') }) as never;

const cases = [
	{ what: 'signed out', user: null, isLoggedIn: false },
	{
		what: 'Anonymous Account (#196 placeholder email)',
		user: { id: 'g1', email: 'g1@anonymous.placeholder.invalid' },
		isLoggedIn: false
	},
	{ what: 'registered', user: { id: 'u1', email: 'me@user.com' }, isLoggedIn: true }
];

describe('login/signup isLoggedIn is "registered", not "has a session" (#241)', () => {
	it.each(cases)('login: $what -> $isLoggedIn', async ({ user, isLoggedIn }) => {
		const data = (await loginLoad(ev(user))) as { isLoggedIn: boolean };
		expect(data.isLoggedIn).toBe(isLoggedIn);
	});

	it.each(cases)('signup: $what -> $isLoggedIn', async ({ user, isLoggedIn }) => {
		const data = (await signupLoad(ev(user))) as { isLoggedIn: boolean };
		expect(data.isLoggedIn).toBe(isLoggedIn);
	});
});

describe('login/signup honour ?redirect= (same-origin only) (#244)', () => {
	// SAFETY: test double — both loads read only locals.user and url.
	const at = (qs: string) =>
		({ locals: { user: null }, url: new URL(`http://test.com/login${qs}`) }) as never;

	it.each([
		['?redirect=/family/join/ABC123', '/family/join/ABC123'],
		['?redirect=%2Fcheckout', '/checkout'],
		['', '/calendar'],
		['?redirect=//evil.com', '/calendar'],
		['?redirect=https://evil.com', '/calendar'],
		['?redirect=/%5Cevil.com', '/calendar']
	])('%s -> %s', async (qs, expected) => {
		const login = (await loginLoad(at(qs))) as { redirectTo: string };
		const signup = (await signupLoad(at(qs))) as { redirectTo: string };
		expect(login.redirectTo).toBe(expected);
		expect(signup.redirectTo).toBe(expected);
	});
});
