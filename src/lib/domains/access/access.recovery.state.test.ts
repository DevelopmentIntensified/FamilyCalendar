/**
 * The recovery screens in node: the forgot call's single answer, and the reset
 * form's refusals (missing token first), the success panel and its scheduled
 * return to `/login`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import type { AuthApi } from './access.api';
import { ForgotPasswordState, ResetPasswordState } from './access.recovery.state.svelte.js';

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

describe('ForgotPasswordState.submit', () => {
	it('settles on the confirmation panel whatever the address', async () => {
		const state = new ForgotPasswordState(api());
		state.email = 'nobody@example.com';
		await state.submit();
		expect(state.sent).toBe(true);
		expect(state.error).toBe('');
	});

	it("shows the server's refusal", async () => {
		const state = new ForgotPasswordState(
			api({ requestPasswordReset: () => refused(429, 'Too many attempts. Try again shortly.') })
		);
		await state.submit();
		expect(state.sent).toBe(false);
		expect(state.error).toBe('Too many attempts. Try again shortly.');
	});

	it("falls back to legacy's send copy when nothing arrived", async () => {
		const state = new ForgotPasswordState(
			api({ requestPasswordReset: () => refused(0, 'Network problem. Try again.') })
		);
		await state.submit();
		expect(state.error).toBe('Failed to send reset email');
	});
});

describe('ResetPasswordState', () => {
	it('shows the missing-token sentence before any submit', () => {
		const state = new ResetPasswordState(api(), '', () => {});
		expect(state.error).toBe('Invalid or missing reset token. Please request a new password reset.');
	});

	it('refuses a missing token without calling the server', async () => {
		let called = false;
		const state = new ResetPasswordState(
			api({
				resetPassword: () => {
					called = true;
					return ok({});
				}
			}),
			'',
			() => {}
		);
		await state.submit();
		expect(state.error).toBe('Invalid reset token');
		expect(called).toBe(false);
	});

	it('refuses a mismatch before the length', async () => {
		const state = new ResetPasswordState(api(), 'tok', () => {});
		state.password = 'secret12';
		state.confirmPassword = 'secret13';
		await state.submit();
		expect(state.error).toBe('Passwords do not match');
	});

	it('shows the success panel and leaves for login after the beat', async () => {
		const manual = manualScheduler();
		const visits: string[] = [];
		const state = new ResetPasswordState(api(), 'tok', (path) => visits.push(path), manual.schedule);
		state.password = 'secret12';
		state.confirmPassword = 'secret12';
		await state.submit();
		expect(state.success).toBe(true);
		expect(visits).toEqual([]);
		manual.fireAll();
		expect(visits).toEqual(['/login']);
	});

	it("shows the server's refusal, e.g. a used link", async () => {
		const state = new ResetPasswordState(
			api({
				resetPassword: () =>
					refused(400, 'This reset link has already been used. Please request a new one.')
			}),
			'tok',
			() => {}
		);
		state.password = 'secret12';
		state.confirmPassword = 'secret12';
		await state.submit();
		expect(state.success).toBe(false);
		expect(state.error).toBe('This reset link has already been used. Please request a new one.');
	});
});
