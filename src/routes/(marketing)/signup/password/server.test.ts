import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type SignupPasswordDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getUserByEmail = vi.fn();
const createUser = vi.fn();
const ensurePersonalCalendar = vi.fn();
const hashPassword = vi.fn();
const setSessionCookie = vi.fn();
const createCode = vi.fn();
const sendEmail = vi.fn();
const createJwt = vi.fn();
const sessionApi = { createSession: vi.fn(), createSessionCookie: vi.fn() };
const gate = vi.fn(() => true);

const deps: SignupPasswordDeps = {
	getUserByEmail,
	createUser,
	ensurePersonalCalendar,
	hashPassword,
	session: sessionApi,
	setSessionCookie,
	createCode,
	sendEmail,
	createJwt,
	fromEmail: 'noreply@test.com',
	jwtSecret: new TextEncoder().encode('test-secret-1234567890'),
	baseSiteUrl: 'http://test.com',
	gate
};

// SAFETY: test double — POST only reads request.json(), request.headers via
// clientKey, and cookies.get via the guest-stash bookkeeping.
function mockEvent(
	body: { email?: string; password?: string; firstName?: string; lastName?: string },
	ip: string
) {
	// SAFETY: test double — the handler only reads the fields set below.
	return {
		request: {
			json: () => Promise.resolve(body),
			headers: { get: () => ip }
		},
		cookies: { get: () => undefined, set: () => {} }
	} as never;
}

function validBody() {
	return {
		email: 'new@user.com',
		password: 'password123',
		firstName: 'New',
		lastName: 'User'
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	gate.mockReturnValue(true);
	getUserByEmail.mockResolvedValue(undefined);
	hashPassword.mockResolvedValue('hashed-password');
	createUser.mockResolvedValue({ id: 'user-1', email: 'new@user.com', firstName: 'New' });
	ensurePersonalCalendar.mockResolvedValue({ id: 'cal-1' });
	sessionApi.createSession.mockResolvedValue({ id: 'session-1', token: 'abc' });
	// Restated for #196 slice 1: cookie name moved from lucia's `auth_session`
	// to better-auth's default `better-auth.session_token`.
	sessionApi.createSessionCookie.mockResolvedValue({
		name: 'better-auth.session_token',
		value: 'abc.sig',
		attributes: {}
	});
	sendEmail.mockResolvedValue({ success: true, error: undefined, data: { id: 'email-1' } });
	createJwt.mockResolvedValue('mock.jwt.token');
});

describe('POST /signup/password', () => {
	it('creates an unverified user, sends the verification code email, and returns 201 pending', async () => {
		const response = await POST(mockEvent(validBody(), 'ip-happy'), deps);

		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body).toEqual({
			success: true,
			user: { id: 'user-1', email: 'new@user.com', firstName: 'New' },
			emailVerification: 'pending'
		});
		expect(createUser).toHaveBeenCalledWith({
			email: 'new@user.com',
			passwordHash: 'hashed-password',
			firstName: 'New',
			lastName: 'User',
			emailVerified: false,
			roles: []
		});
		expect(gate).toHaveBeenCalledWith('pw-signup-code:new@user.com');
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(sendEmail.mock.calls[0][0].to).toBe('new@user.com');
		expect(createCode).toHaveBeenCalledTimes(1);
	});

	it('returns 400 for a duplicate email without creating or emailing', async () => {
		getUserByEmail.mockResolvedValue({ id: 'user-1', email: 'taken@user.com' });

		const response = await POST(
			mockEvent({ ...validBody(), email: 'taken@user.com' }, 'ip-dup'),
			deps
		);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'An account with this email already exists' });
		expect(createUser).not.toHaveBeenCalled();
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('returns 400 for a weak password', async () => {
		const response = await POST(
			mockEvent({ ...validBody(), password: 'short' }, 'ip-weak'),
			deps
		);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'Password must be at least 8 characters' });
		expect(createUser).not.toHaveBeenCalled();
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('returns 429 once the rate limit trips', async () => {
		for (let i = 0; i < 10; i++) {
			const allowed = await POST(mockEvent(validBody(), 'ip-limit'), deps);
			expect(allowed.status).toBe(201);
		}

		const limited = await POST(mockEvent(validBody(), 'ip-limit'), deps);

		expect(limited.status).toBe(429);
		expect(await limited.json()).toEqual({ error: 'Too many attempts. Try again shortly.' });
	});

	it('returns 429 on the per-IP gate even when emails differ', async () => {
		for (let i = 0; i < 30; i++) {
			const allowed = await POST(
				mockEvent({ ...validBody(), email: `fresh-${i}@user.com` }, 'ip-shared'),
				deps
			);
			expect(allowed.status).toBe(201);
		}

		const limited = await POST(
			mockEvent({ ...validBody(), email: 'fresh-30@user.com' }, 'ip-shared'),
			deps
		);

		expect(limited.status).toBe(429);
		expect(await limited.json()).toEqual({ error: 'Too many attempts. Try again shortly.' });
	});

	it('still returns 201 pending when the verification email fails to send', async () => {
		sendEmail.mockResolvedValue({ success: false, error: 'boom', data: undefined });
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			const response = await POST(mockEvent(validBody(), 'ip-sendfail'), deps);

			const body = await response.json();

			expect(response.status).toBe(201);
			expect(body.success).toBe(true);
			expect(body.emailVerification).toBe('pending');
			expect(createUser).toHaveBeenCalledTimes(1);
			expect(logged).toHaveBeenCalled();
		} finally {
			logged.mockRestore();
		}
	});
});
