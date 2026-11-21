/**
 * `SignupState` in node: the two client refusals, the pending answer's shared
 * code screen, which door each confirm and resend uses, the verified toast and
 * the resend pill.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte.js';
import type { AuthApi } from './access.api';
import { SignupState } from './access.signup.state.svelte.js';

const ok = <T>(data: T) => Promise.resolve({ ok: true as const, data });
const refused = (status: number, error: string) =>
	Promise.resolve({ ok: false as const, status, error });

const signedIn = { success: true as const, user: { id: 'u1', email: 'a@b.co', firstName: 'A' } };

function api(over: Partial<AuthApi> = {}): AuthApi {
	return {
		requestLoginLink: () => ok({}),
		submitLoginCode: () => ok({}),
		signInWithPassword: () => ok(signedIn),
		requestSignupLink: () => ok({}),
		submitSignupCode: () => ok({}),
		signUpWithPassword: () => ok(signedIn),
		verifySignupPasswordCode: () => ok({}),
		resendSignupVerification: () => ok({}),
		requestPasswordReset: () => ok({}),
		resetPassword: () => ok({}),
		...over
	};
}

function build(authApi: AuthApi) {
	const visits: string[] = [];
	const toasts = memoryToasts();
	const signup = new SignupState(authApi, toasts, {
		redirectTo: '/calendar',
		isLoggedIn: false,
		redirect: (path) => visits.push(path)
	});
	return { signup, visits, toasts };
}

describe('SignupState.signUpWithPassword', () => {
	it('refuses a mismatch before calling the server', async () => {
		let called = false;
		const { signup } = build(
			api({
				signUpWithPassword: () => {
					called = true;
					return ok(signedIn);
				}
			})
		);
		signup.password = 'secret12';
		signup.confirmPassword = 'secret13';
		await signup.signUpWithPassword();
		expect(signup.error).toBe('Passwords do not match');
		expect(called).toBe(false);
	});

	it('refuses a short password before calling the server', async () => {
		let called = false;
		const { signup } = build(
			api({
				signUpWithPassword: () => {
					called = true;
					return ok(signedIn);
				}
			})
		);
		signup.password = 'short';
		signup.confirmPassword = 'short';
		await signup.signUpWithPassword();
		expect(signup.error).toBe('Password must be at least 8 characters');
		expect(called).toBe(false);
	});

	it('shows the code screen for the pending answer, without leaving', async () => {
		const { signup, visits } = build(
			api({
				signUpWithPassword: () =>
					ok({ success: true, user: signedIn.user, emailVerification: 'pending' as const })
			})
		);
		signup.password = 'secret12';
		signup.confirmPassword = 'secret12';
		await signup.signUpWithPassword();
		expect(signup.passwordVerifyPending).toBe(true);
		expect(signup.sent).toBe(true);
		expect(visits).toEqual([]);
	});
});

describe('SignupState.submitCode', () => {
	it('uses the password-signup door, toasts and leaves when a password signup is pending', async () => {
		const doors: string[] = [];
		const { signup, visits, toasts } = build(
			api({
				verifySignupPasswordCode: () => {
					doors.push('verify-password');
					return ok({});
				},
				submitSignupCode: () => {
					doors.push('link');
					return ok({});
				}
			})
		);
		signup.passwordVerifyPending = true;
		signup.email = 'a@b.co';
		signup.code = '12345678';
		await signup.submitCode();
		expect(doors).toEqual(['verify-password']);
		expect(toasts.items).toEqual([
			{ kind: 'success', text: 'Email verified — welcome to Family Planz.' }
		]);
		expect(visits).toEqual(['/calendar']);
	});

	it('uses the link door for a magic-link signup', async () => {
		const doors: string[] = [];
		const { signup } = build(
			api({
				verifySignupPasswordCode: () => {
					doors.push('verify-password');
					return ok({});
				},
				submitSignupCode: () => {
					doors.push('link');
					return ok({});
				}
			})
		);
		await signup.submitCode();
		expect(doors).toEqual(['link']);
	});

	it("shows the server's refusal and stays", async () => {
		const { signup, visits } = build(
			api({ submitSignupCode: () => refused(500, 'Unexpected error, please try again') })
		);
		await signup.submitCode();
		expect(signup.error).toBe('Unexpected error, please try again');
		expect(visits).toEqual([]);
	});
});

describe('SignupState.resend', () => {
	it('resends through the signed-in door for a password signup', async () => {
		const doors: string[] = [];
		const { signup } = build(
			api({
				resendSignupVerification: () => {
					doors.push('resend-password');
					return ok({});
				},
				requestSignupLink: () => {
					doors.push('link');
					return ok({});
				}
			})
		);
		signup.passwordVerifyPending = true;
		await signup.resend();
		expect(doors).toEqual(['resend-password']);
		expect(signup.resent).toBe(true);
	});

	it('clears the resend pill after the beat', async () => {
		const manual = manualScheduler();
		const toasts = memoryToasts();
		const signup = new SignupState(api(), toasts, {
			redirectTo: '/calendar',
			isLoggedIn: false,
			redirect: () => {},
			schedule: manual.schedule
		});
		await signup.resend();
		expect(signup.resent).toBe(true);
		manual.fireAll();
		expect(signup.resent).toBe(false);
	});
});

describe('SignupState network fallbacks', () => {
	it('keeps legacy\'s create-account sentence for a request that never arrived', async () => {
		const { signup } = build(
			api({ signUpWithPassword: () => refused(0, 'Network problem. Try again.') })
		);
		signup.password = 'secret12';
		signup.confirmPassword = 'secret12';
		await signup.signUpWithPassword();
		expect(signup.error).toBe('Failed to create account');
	});
});
