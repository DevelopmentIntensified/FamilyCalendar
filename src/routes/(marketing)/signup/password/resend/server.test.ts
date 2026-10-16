import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type PasswordResendDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getUser = vi.fn();
const createCode = vi.fn();
const sendEmail = vi.fn();
const createJwt = vi.fn();
const gate = vi.fn(() => true);

const deps: PasswordResendDeps = {
	getUser,
	createCode,
	sendEmail,
	createJwt,
	fromEmail: 'noreply@test.com',
	jwtSecret: new TextEncoder().encode('test-secret-1234567890'),
	baseSiteUrl: 'http://test.com',
	gate
};

// SAFETY: test double — POST only reads request.headers via clientKey and
// locals.user for the caller's identity.
function mockEvent(ip: string, user: { id: string } | null) {
	// SAFETY: test double — the handler only reads the fields set below.
	return {
		request: {
			json: () => Promise.resolve({}),
			headers: { get: () => ip }
		},
		cookies: { get: () => undefined, set: () => {} },
		locals: { user }
	} as never;
}

function caller() {
	return { id: 'user-1' };
}

beforeEach(() => {
	vi.clearAllMocks();
	gate.mockReturnValue(true);
	getUser.mockResolvedValue({
		id: 'user-1',
		email: 'me@user.com',
		firstName: 'Me',
		lastName: 'User',
		emailVerified: false
	});
	sendEmail.mockResolvedValue({ success: true, error: undefined, data: { id: 'email-1' } });
	createJwt.mockResolvedValue('mock.jwt.token');
});

describe('POST /signup/password/resend', () => {
	it('re-sends the verification code for an unverified caller', async () => {
		const response = await POST(mockEvent('ip-send', caller()), deps);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true });
		expect(getUser).toHaveBeenCalledWith('user-1');
		expect(gate).toHaveBeenCalledWith('pw-signup-code:me@user.com');
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(sendEmail.mock.calls[0][0].to).toBe('me@user.com');
		expect(createCode).toHaveBeenCalledTimes(1);
	});

	it('no-ops with success for an already-verified caller without emailing', async () => {
		getUser.mockResolvedValue({
			id: 'user-1',
			email: 'me@user.com',
			firstName: 'Me',
			lastName: 'User',
			emailVerified: true
		});

		const response = await POST(mockEvent('ip-noop', caller()), deps);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true });
		expect(sendEmail).not.toHaveBeenCalled();
		expect(createCode).not.toHaveBeenCalled();
	});

	it('returns 401 for an anonymous caller without looking anyone up', async () => {
		const response = await POST(mockEvent('ip-anon', null), deps);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
		expect(getUser).not.toHaveBeenCalled();
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('returns 401 when the session user no longer exists', async () => {
		getUser.mockResolvedValue(undefined);

		const response = await POST(mockEvent('ip-stale', caller()), deps);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('returns 429 once the per-user rate limit trips', async () => {
		for (let i = 0; i < 5; i++) {
			const allowed = await POST(mockEvent('ip-rl', { id: 'user-limited' }), deps);
			expect(allowed.status).toBe(200);
		}

		const limited = await POST(mockEvent('ip-rl', { id: 'user-limited' }), deps);

		expect(limited.status).toBe(429);
		expect(await limited.json()).toEqual({ error: 'Too many attempts. Try again shortly.' });
	});
});
