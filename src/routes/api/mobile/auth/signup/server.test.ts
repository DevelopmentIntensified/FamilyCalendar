import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type MobileSignupDeps } from './+server';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';

/**
 * POST /api/mobile/auth/signup (#292 G12): the web password sign-up
 * (createPasswordAccount — same checks/messages), answered with an fp_
 * token; the verification code still goes out.
 */
function makeDeps(existing = false) {
	return {
		getUserByEmail: vi.fn(async () => (existing ? { id: 'old' } : undefined)),
		createUser: vi.fn(async (u: Record<string, unknown>) => ({ id: 'u-new', ...u })),
		ensurePersonalCalendar: vi.fn(async () => ({ id: 'cal' })),
		hashPassword: vi.fn(async () => 'hash'),
		createCode: vi.fn(),
		sendEmail: vi.fn(async () => ({ success: true })),
		createJwt: vi.fn(async () => 'jwt'),
		fromEmail: 'noreply@x.com',
		jwtSecret: new Uint8Array([1]),
		baseSiteUrl: 'https://fp.test',
		gate: () => true,
		createApiToken: vi.fn(async () => ({ token: 'fp_new', row: { id: 't1' } }))
	} as unknown as MobileSignupDeps & Record<string, ReturnType<typeof vi.fn>>;
}

function ev(body: unknown) {
	// SAFETY: test double — the handler reads event.request only.
	return {
		request: new Request('http://x/api/mobile/auth/signup', {
			method: 'POST',
			headers: { 'x-forwarded-for': '1.2.3.4' },
			body: typeof body === 'string' ? body : JSON.stringify(body)
		})
	} as never;
}

const OK = { firstName: 'Ann', lastName: 'Lee', email: 'ann@x.com', password: 'longenough', deviceName: 'Pixel 9' };

beforeEach(() => clearRateLimitState());

describe('POST /api/mobile/auth/signup (G12)', () => {
	it('400 on malformed JSON', async () => {
		expect((await POST(ev('{x'), makeDeps())).status).toBe(400);
	});

	it.each([
		[{ ...OK, lastName: '' }, 'All fields are required'],
		[{ ...OK, password: 'short' }, 'Password must be at least 8 characters']
	])('400 %j', async (body, error) => {
		const deps = makeDeps();
		const res = await POST(ev(body), deps);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error });
		expect(deps.createUser).not.toHaveBeenCalled();
	});

	it('400 when the email is taken (same as the web sign-up)', async () => {
		const res = await POST(ev(OK), makeDeps(true));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'An account with this email already exists' });
	});

	it('creates the unverified account, mints a device token, sends the code', async () => {
		const deps = makeDeps();
		const res = await POST(ev(OK), deps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			token: 'fp_new',
			user: { id: 'u-new', firstName: 'Ann', lastName: 'Lee', email: 'ann@x.com', emailVerified: false },
			emailVerification: 'pending'
		});
		expect(deps.createUser).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'ann@x.com', emailVerified: false, passwordHash: 'hash' })
		);
		expect(deps.createApiToken).toHaveBeenCalledWith('u-new', 'Android — Pixel 9');
		expect(deps.createCode).toHaveBeenCalled();
	});
});
