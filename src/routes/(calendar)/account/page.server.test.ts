import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { actions, type UpdateEmailDeps } from './+page.server';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';

type RequestResult = Record<string, unknown> | void;

// SAFETY: SvelteKit's Actions type erases the handler's optional deps
// parameter; the real handler accepts it (tests call it through this cast).
const callUpdateEmail = actions.updateEmail as (
	event: RequestEvent,
	deps: UpdateEmailDeps
) => Promise<RequestResult>;

type DepsMocks = {
	deps: UpdateEmailDeps;
	getUser: Mock;
	sendEmail: Mock;
	createJwt: Mock;
	deleteCodesByEmail: Mock;
	createCode: Mock;
};

function makeDeps(overrides: Partial<UpdateEmailDeps> = {}): DepsMocks {
	const getUser = vi.fn().mockResolvedValue({
		id: 'u-1',
		email: 'delivered+email-change-current@resend.dev',
		firstName: 'Pat',
		lastName: 'Smith'
	});
	const sendEmail = vi.fn().mockResolvedValue({ ok: true });
	const createJwt = vi.fn().mockResolvedValue('mock.jwt.token');
	const deleteCodesByEmail = vi.fn();
	const createCode = vi.fn();
	const deps: UpdateEmailDeps = {
		getUser,
		sendEmail,
		createJwt,
		baseUrl: 'http://test.com',
		fromEmail: 'noreply@test.com',
		emailSecret: new TextEncoder().encode('test-secret-1234567890'),
		deleteCodesByEmail,
		createCode,
		...overrides
	};
	return { deps, getUser, sendEmail, createJwt, deleteCodesByEmail, createCode };
}

function mockEvent(email: string, userId = `u-${Math.random().toString(36).slice(2, 10)}`, ip = '10.0.0.1') {
	const formData = new FormData();
	formData.set('email', email);
	const headers = {
		get: (name: string) => (name === 'x-forwarded-for' ? ip : null)
	};
	// SAFETY: test double — the action only reads request.formData() and
	// request.headers (for rate limiting), plus locals.user.
	return { request: { formData: () => Promise.resolve(formData), headers }, locals: { user: { id: userId } } } as never;
}

function failureOf(result: RequestResult): { status: number; data: Record<string, unknown> } {
	// SAFETY: failing branches return fail(...), which structurally carries
	// status/data (same narrowing style as the claim page test).
	return result as { status: number; data: Record<string, unknown> };
}

beforeEach(() => {
	clearRateLimitState();
});

describe('updateEmail action — Oct-hardening survival (#196 slice 4)', () => {
	it('throttles the fourth send per user within 15 minutes (3/15m, user-bound key)', async () => {
		const { deps, sendEmail } = makeDeps();

		for (let i = 0; i < 3; i++) {
			await callUpdateEmail(mockEvent('delivered+email-change@resend.dev', 'throttle-user', '10.0.0.7'), deps);
		}
		const fourth = await callUpdateEmail(mockEvent('delivered+email-change@resend.dev', 'throttle-user', '10.0.0.7'), deps);

		expect(failureOf(fourth).status).toBe(429);
		expect(sendEmail).toHaveBeenCalledTimes(3);
	});

	it('guests (no email yet) are told to claim, never mailed', async () => {
		const { deps, sendEmail } = makeDeps({
			getUser: vi.fn().mockResolvedValue({ id: 'u-g', email: null })
		});

		const result = await callUpdateEmail(mockEvent('delivered+email-change-guest@resend.dev'), deps);

		expect(failureOf(result).status).toBe(400);
		expect(failureOf(result).data.guestNeedsClaim).toBe(true);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('binds the code to the current address and the new one (email_change + pendingEmail), wiping stale codes first', async () => {
		const { deps, createJwt, deleteCodesByEmail, createCode, sendEmail } = makeDeps();

		const result = await callUpdateEmail(mockEvent('delivered+email-change-new@resend.dev', 'binding-user'), deps);
		expect(result).toMatchObject({ success: true });

		expect(deleteCodesByEmail).toHaveBeenCalledWith('delivered+email-change-current@resend.dev');
		expect(createJwt).toHaveBeenCalledWith(
			'HS256',
			deps.emailSecret,
			expect.objectContaining({ pendingEmail: 'delivered+email-change-new@resend.dev', code: expect.any(String) }),
			expect.objectContaining({ expiresIn: expect.anything() })
		);
		expect(createCode.mock.calls[0]?.[0]).toMatchObject({
			type: 'email_change',
			email: 'delivered+email-change-current@resend.dev',
			pendingEmail: 'delivered+email-change-new@resend.dev',
			firstName: 'Pat',
			lastName: 'Smith'
		});
		expect(deleteCodesByEmail.mock.invocationCallOrder[0]).toBeLessThan(createCode.mock.invocationCallOrder[0]);

		expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({
			to: 'delivered+email-change-new@resend.dev',
			from: deps.fromEmail
		});
	});

	it('rejects a change to the currently-used address (no self-loop codes)', async () => {
		const { deps, sendEmail, createCode } = makeDeps();

		const result = await callUpdateEmail(mockEvent('delivered+email-change-current@resend.dev'), deps);

		expect(failureOf(result).status).toBe(400);
		expect(sendEmail).not.toHaveBeenCalled();
		expect(createCode).not.toHaveBeenCalled();
	});
});
