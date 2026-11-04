import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #292 G12 password-reset + email-verify twins. Each IS the web handler
 * (forgot-password, forgot-password/reset, signup/password/verify|resend);
 * pinned here: the uniform forgot answer (no enumeration), the reset
 * validation reaching the web handler, and verify binding the code to the
 * caller's own email.
 */
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed user reads.
vi.mock('$lib/server/db/actions/users', async (orig) => ({
	...(await orig<object>()),
	getUserByEmail: vi.fn(async (email: string) =>
		email === 'real@x.com' ? { id: 'u1', email, emailVerified: false } : undefined
	),
	verifyUserEmail: vi.fn()
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- outbound mail.
vi.mock('$lib/utils/sendEmail', () => ({ sendEmail: vi.fn(async () => ({ success: true })) }));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed hashed codes.
vi.mock('$lib/server/db/actions/codes', async (orig) => ({
	...(await orig<object>()),
	deleteDeadCodes: vi.fn(),
	deleteHashedCode: vi.fn(),
	getHashedCode: vi.fn(async (f: { code: string; email: string }) =>
		f.code === '12345678' ? { email: f.email } : undefined
	)
}));

import { POST as FORGOT } from './+server';
import { POST as RESET } from '../reset/+server';
import { POST as VERIFY } from '../../../me/verify-email/+server';
import { POST as RESEND } from '../../../me/verify-email/resend/+server';
import { sendEmail } from '$lib/utils/sendEmail';
import { getHashedCode } from '$lib/server/db/actions/codes';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';

function ev(body: unknown, user: Record<string, unknown> | null = null) {
	// SAFETY: test double — the handlers read request and locals.
	return {
		locals: { user },
		request: new Request('http://x/api', {
			method: 'POST',
			headers: { 'x-forwarded-for': '5.5.5.5' },
			body: JSON.stringify(body)
		})
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	clearRateLimitState();
});

describe('POST /api/mobile/auth/forgot (G12)', () => {
	it('the same {sent:true} for a real and an unknown email; only the real one is mailed', async () => {
		const a = await FORGOT(ev({ email: 'real@x.com' }));
		const b = await FORGOT(ev({ email: 'nobody@x.com' }));
		expect([a.status, b.status]).toEqual([200, 200]);
		expect(await a.json()).toEqual({ sent: true });
		expect(await b.json()).toEqual({ sent: true });
		expect(sendEmail).toHaveBeenCalledTimes(1);
	});

	it('400 without an email (web message)', async () => {
		const res = await FORGOT(ev({}));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Email is required' });
	});
});

describe('POST /api/mobile/auth/reset (G12)', () => {
	it('400 without token/password', async () => {
		const res = await RESET(ev({ token: '' }));
		expect(await res.json()).toEqual({ error: 'Token and password are required' });
	});

	it('400 for a forged token', async () => {
		const res = await RESET(ev({ token: 'not.a.jwt', password: 'longenough' }));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: 'Invalid or expired reset token. Please request a new one.'
		});
	});

	it('429 once the per-IP limit trips', async () => {
		for (let i = 0; i < 10; i++) {
			expect((await RESET(ev({ token: 't' }))).status).toBe(400);
		}
		const limited = await RESET(ev({ token: 't' }));
		expect(limited.status).toBe(429);
		expect(await limited.json()).toEqual({ error: 'Too many attempts. Try again shortly.' });
	});
});

describe('POST /api/me/verify-email (G12)', () => {
	it('401 without auth', async () => {
		expect((await VERIFY(ev({ code: '1' }))).status).toBe(401);
	});

	it("redeems a code against the caller's OWN email only", async () => {
		const res = await VERIFY(ev({ code: '12345678', email: 'other@x.com' }, { id: 'u1', email: 'real@x.com' }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
		expect(getHashedCode).toHaveBeenCalledWith({
			code: '12345678',
			email: 'real@x.com',
			type: 'password-signup'
		});
	});

	it('400 generic error for a wrong code', async () => {
		const res = await VERIFY(ev({ code: '000' }, { id: 'u1', email: 'real@x.com' }));
		expect(res.status).toBe(400);
	});
});

describe('POST /api/me/verify-email/resend (G12)', () => {
	it('401 without auth', async () => {
		expect((await RESEND(ev({}))).status).toBe(401);
	});
});
