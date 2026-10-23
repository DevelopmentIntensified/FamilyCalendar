import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { createJWT, parseJWT } from 'oslo/jwt';
import { actions, type VerifyEmailDeps } from './+page.server';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';

type RequestResult = Record<string, unknown> | void;

// SAFETY: SvelteKit's Actions type erases the handler's optional deps
// parameter; the real handler accepts it (tests call it through this cast).
const callVerify = actions.verify as (
	event: RequestEvent,
	deps: VerifyEmailDeps
) => Promise<RequestResult>;

const SECRET = new TextEncoder().encode('verify-email-secret-1234567890');

type DepsMocks = {
	deps: VerifyEmailDeps;
	getCode: Mock;
	deleteCode: Mock;
	getUser: Mock;
	applyEmailChange: Mock;
	emailExists: Mock;
};

function makeDeps(codeRow: Record<string, unknown> | undefined): DepsMocks {
	const getCode = vi.fn().mockResolvedValue(codeRow);
	const deleteCode = vi.fn();
	const getUser = vi.fn().mockResolvedValue({
		id: 'u-1',
		email: 'delivered+verify-current@resend.dev'
	});
	const applyEmailChange = vi.fn();
	const emailExists = vi.fn().mockResolvedValue(false);
	const deps: VerifyEmailDeps = {
		getCode,
		deleteCode,
		getUser,
		applyEmailChange,
		emailExists,
		emailSecret: SECRET
	};
	return { deps, getCode, deleteCode, getUser, applyEmailChange, emailExists };
}

function mockEvent(fields: { token?: string; code?: string }, ip = '10.0.0.1') {
	const formData = new FormData();
	if (fields.token) formData.set('token', fields.token);
	if (fields.code) formData.set('code', fields.code);
	const headers = {
		get: (name: string) => (name === 'x-forwarded-for' ? ip : null)
	};
	// SAFETY: test double — the action only reads request.formData() and
	// request.headers (for rate limiting), plus locals.user.
	return { request: { formData: () => Promise.resolve(formData), headers }, locals: { user: { id: 'u-1' } } } as never;
}

function failureOf(result: RequestResult): { status: number; data: Record<string, unknown> } {
	// SAFETY: failing branches return fail(...), which structurally carries
	// status/data (same narrowing style as the claim page test).
	return result as { status: number; data: Record<string, unknown> };
}

const validCode = (overrides: Record<string, unknown> = {}) => ({
	code: '24681357',
	email: 'delivered+verify-current@resend.dev',
	pendingEmail: 'delivered+verify-new@resend.dev',
	type: 'email_change',
	expiresAt: new Date(Date.now() + 60 * 1000 * 15),
	...overrides
});

beforeEach(() => {
	clearRateLimitState();
});

describe('verify-email action — Oct-hardening survival (#196 slice 4)', () => {
	it('throttles the 11th verification attempt per IP within 15 minutes (10/15m)', async () => {
		const { deps, getCode } = makeDeps(undefined);

		for (let i = 0; i < 10; i++) {
			await callVerify(mockEvent({ code: `attempt-${i}` }, '10.0.7.7'), deps);
		}
		expect(getCode).toHaveBeenCalledTimes(10);

		const eleventh = await callVerify(mockEvent({ code: 'attempt-10' }, '10.0.7.7'), deps);

		expect(failureOf(eleventh).status).toBe(429);
		expect(getCode).toHaveBeenCalledTimes(10);
	});

	it('consumes a bound code: applies the pending email + verifies it, then deletes the code', async () => {
		const { deps, applyEmailChange, deleteCode } = makeDeps(validCode());

		const result = await callVerify(mockEvent({ code: '24681357' }, '10.0.0.2'), deps);

		expect(result).toMatchObject({ success: true });
		expect(applyEmailChange).toHaveBeenCalledWith('u-1', 'delivered+verify-new@resend.dev');
		expect(applyEmailChange.mock.invocationCallOrder[0]).toBeLessThan(deleteCode.mock.invocationCallOrder[0]);
	});

	it('rejects a code whose bound consumer differs from the verifying session (code-consumer binding)', async () => {
		const { deps, applyEmailChange, deleteCode } = makeDeps({
			...validCode(),
			email: 'delivered+someone-else@resend.dev'
		});

		const result = await callVerify(mockEvent({ code: '24681357' }, '10.0.0.3'), deps);

		expect(failureOf(result).status).toBe(400);
		expect(applyEmailChange).not.toHaveBeenCalled();
		expect(deleteCode).not.toHaveBeenCalled();
	});

	it('rejects codes of the wrong type', async () => {
		const { deps, applyEmailChange } = makeDeps({ ...validCode(), type: 'signup' });

		const result = await callVerify(mockEvent({ code: '24681357' }, '10.0.0.4'), deps);

		expect(failureOf(result).status).toBe(400);
		expect(applyEmailChange).not.toHaveBeenCalled();
	});

	it('rejects expired codes', async () => {
		const { deps, applyEmailChange } = makeDeps({ ...validCode(), expiresAt: new Date(Date.now() - 1000) });

		const result = await callVerify(mockEvent({ code: '24681357' }, '10.0.0.5'), deps);

		expect(failureOf(result).status).toBe(400);
		expect(applyEmailChange).not.toHaveBeenCalled();
	});

	it('rejects unknown codes without touching the user row', async () => {
		const { deps, applyEmailChange } = makeDeps(undefined);

		const result = await callVerify(mockEvent({ code: '13' }, '10.0.0.6'), deps);

		expect(failureOf(result).status).toBe(400);
		expect(applyEmailChange).not.toHaveBeenCalled();
	});

	it('accepts a signed JWT link and applies its pending email', async () => {
		const { deps, applyEmailChange, deleteCode } = makeDeps(
			validCode({ code: '86421357', pendingEmail: 'delivered+verify-link@resend.dev' })
		);

	const token = await createJWT('HS256', SECRET, { code: '86421357', pendingEmail: 'delivered+verify-link@resend.dev' });
	const parsed = await parseJWT(token);
	expect(parsed, 'fixture sanity: token parses').not.toBeNull();

	const result = await callVerify(mockEvent({ token }, '10.0.0.8'), deps);

	expect(result).toMatchObject({ success: true });
	expect(applyEmailChange).toHaveBeenCalledWith('u-1', 'delivered+verify-link@resend.dev');
	expect(deleteCode).toHaveBeenCalledWith('86421357');
});

describe('verify-email token path — single-use + collision (#166)', () => {
	const linkToken = () =>
		createJWT('HS256', SECRET, {
			code: '86421357',
			pendingEmail: 'delivered+verify-link@resend.dev'
		});
	const linkRow = () =>
		validCode({ code: '86421357', pendingEmail: 'delivered+verify-link@resend.dev' });

	it('rejects a replayed token on second use (single-use burn)', async () => {
		const { deps, applyEmailChange, getCode } = makeDeps(undefined);
		const token = await linkToken();
		getCode.mockResolvedValueOnce(linkRow()).mockResolvedValueOnce(undefined);

		const first = await callVerify(mockEvent({ token }, '10.0.0.9'), deps);
		expect(first).toMatchObject({ success: true });

		const replay = await callVerify(mockEvent({ token }, '10.0.0.9'), deps);

		expect(failureOf(replay).status).toBe(400);
		expect(applyEmailChange).toHaveBeenCalledTimes(1);
	});

	it('fails clean when the pending email is already registered (token path)', async () => {
		const { deps, applyEmailChange, emailExists, getCode } = makeDeps(undefined);
		getCode.mockResolvedValue(linkRow());
		emailExists.mockResolvedValue(true);

		const result = await callVerify(mockEvent({ token: await linkToken() }, '10.0.1.0'), deps);

		expect(failureOf(result).status).toBe(400);
		expect(failureOf(result).data.message).toBe('That email is already in use');
		expect(applyEmailChange).not.toHaveBeenCalled();
	});

	it('fails clean when the pending email is already registered (code path)', async () => {
		const { deps, applyEmailChange, emailExists } = makeDeps(validCode());
		emailExists.mockResolvedValue(true);

		const result = await callVerify(mockEvent({ code: '24681357' }, '10.0.1.1'), deps);

		expect(failureOf(result).status).toBe(400);
		expect(failureOf(result).data.message).toBe('That email is already in use');
		expect(applyEmailChange).not.toHaveBeenCalled();
	});

	it('rejects a token whose code row does not match its pending email', async () => {
		const { deps, applyEmailChange, getCode } = makeDeps(undefined);
		getCode.mockResolvedValue(
			validCode({ code: '86421357', pendingEmail: 'delivered+verify-other@resend.dev' })
		);

		const result = await callVerify(mockEvent({ token: await linkToken() }, '10.0.1.2'), deps);

		expect(failureOf(result).status).toBe(400);
		expect(applyEmailChange).not.toHaveBeenCalled();
	});

	it('rejects a token bound to a different consumer than the current session', async () => {
		const { deps, applyEmailChange, getCode } = makeDeps(undefined);
		getCode.mockResolvedValue(
			validCode({
				code: '86421357',
				pendingEmail: 'delivered+verify-link@resend.dev',
				email: 'delivered+someone-else@resend.dev'
			})
		);

		const result = await callVerify(mockEvent({ token: await linkToken() }, '10.0.1.3'), deps);

		expect(failureOf(result).status).toBe(400);
		expect(applyEmailChange).not.toHaveBeenCalled();
	});
});
});
