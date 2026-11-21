/**
 * `LoginState` in node: the password and link calls, the code screen, the
 * resend pill's beat, the URL copy and the network fallbacks — with a fake api
 * and a manual scheduler, no DOM.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import type { AuthApi } from './access.api';
import { LoginState, type LoginStateOptions } from './access.login.state.svelte.js';

const ok = <T>(data: T) => Promise.resolve({ ok: true as const, data });
const refused = (status: number, error: string) =>
	Promise.resolve({ ok: false as const, status, error });

function api(over: Partial<AuthApi> = {}): AuthApi {
	return {
		requestLoginLink: () => ok({}),
		submitLoginCode: () => ok({}),
		signInWithPassword: () => ok({ success: true, user: { id: 'u1', email: 'a@b.co', firstName: 'A' } }),
		requestSignupLink: () => ok({}),
		submitSignupCode: () => ok({}),
		signUpWithPassword: () =>
			ok({ success: true, user: { id: 'u1', email: 'a@b.co', firstName: 'A' } }),
		verifySignupPasswordCode: () => ok({}),
		resendSignupVerification: () => ok({}),
		requestPasswordReset: () => ok({}),
		resetPassword: () => ok({}),
		...over
	};
}

function build(authApi: AuthApi, over: Partial<LoginStateOptions> = {}) {
	const visits: string[] = [];
	const login = new LoginState(authApi, {
		redirectTo: '/calendar',
		isLoggedIn: false,
		mergeMode: false,
		redirect: (path) => void visits.push(path),
		...over
	});
	return { login, visits };
}

describe('LoginState.signInWithPassword', () => {
	it('lands on the redirect target the load sanitised', async () => {
		const { login, visits } = build(api(), { redirectTo: '/family/abc' });
		login.email = 'a@b.co';
		login.password = 'secret12';
		await login.signInWithPassword();
		expect(visits).toEqual(['/family/abc']);
		expect(login.error).toBe('');
		expect(login.waiting).toBe(false);
	});

	it("shows the server's refusal and stays put", async () => {
		const { login, visits } = build(
			api({ signInWithPassword: () => refused(401, 'Invalid email or password') })
		);
		await login.signInWithPassword();
		expect(login.error).toBe('Invalid email or password');
		expect(visits).toEqual([]);
	});

	it('falls back to legacy\'s network copy when the request never arrived', async () => {
		const { login } = build(
			api({ signInWithPassword: () => refused(0, 'Network problem. Try again.') })
		);
		await login.signInWithPassword();
		expect(login.error).toBe('Failed to login');
	});
});

describe('LoginState.sendLink', () => {
	it('shows the code screen after the link was sent', async () => {
		const calls: unknown[] = [];
		const { login } = build(
			api({
				requestLoginLink: (input) => {
					calls.push(input);
					return ok({});
				}
			})
		);
		login.email = 'a@b.co';
		await login.sendLink();
		expect(login.sent).toBe(true);
		expect(calls).toEqual([{ email: 'a@b.co', redirectTo: '/calendar' }]);
	});

	it("shows the server's refusal instead of pretending it sent", async () => {
		const { login } = build(
			api({ requestLoginLink: () => refused(429, 'Too many attempts. Try again shortly.') })
		);
		await login.sendLink();
		expect(login.sent).toBe(false);
		expect(login.error).toBe('Too many attempts. Try again shortly.');
	});
});

describe('LoginState.submitCode', () => {
	it('lands on the target when the code is accepted', async () => {
		const { login, visits } = build(api());
		login.code = '12345678';
		login.email = 'a@b.co';
		await login.submitCode();
		expect(visits).toEqual(['/calendar']);
	});

	it('shows the generic sentence for a refusal without copy', async () => {
		const { login } = build(api({ submitLoginCode: () => refused(500, '') }));
		await login.submitCode();
		expect(login.error).toBe('Invalid code');
	});
});

describe('LoginState.resend', () => {
	it('shows "Sent again" for the confirmation beat and then clears it', async () => {
		const manual = manualScheduler();
		const { login } = build(api(), { schedule: manual.schedule });
		await login.resend();
		expect(login.resent).toBe(true);
		manual.fireAll();
		expect(login.resent).toBe(false);
	});

	it('keeps the pill down on a refusal', async () => {
		const manual = manualScheduler();
		const { login } = build(
			api({ requestLoginLink: () => refused(500, 'There was an error. Please try again.') }),
			{ schedule: manual.schedule }
		);
		await login.resend();
		expect(login.resent).toBe(false);
		expect(login.error).toBe('There was an error. Please try again.');
	});
});

describe('LoginState.applyUrlMessages', () => {
	it('maps a machine code and passes free text through', () => {
		const { login } = build(api());
		login.applyUrlMessages('invalid_token', 'Family joined. Sign in to continue.');
		expect(login.error).toBe('That invite link has expired or is invalid. Ask for a new invite.');
		expect(login.notice).toBe('Family joined. Sign in to continue.');
	});

	it('leaves empty parameters alone', () => {
		const { login } = build(api());
		login.applyUrlMessages(null, null);
		expect(login.error).toBe('');
		expect(login.notice).toBe('');
	});
});
