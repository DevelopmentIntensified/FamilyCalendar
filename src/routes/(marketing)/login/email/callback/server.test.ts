import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, type EmailCallbackDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getAccount = vi.fn();
const getUser = vi.fn();
const getUserByEmail = vi.fn();
const createCode = vi.fn();
const sendEmail = vi.fn();
const createJwt = vi.fn();
const verifyJwt = vi.fn();
const lucia = {
	createSession: vi.fn(),
	createSessionCookie: vi.fn(),
	invalidateSession: vi.fn()
};
const deleteCodesByEmail = vi.fn();
const updateLastLogin = vi.fn();

const deps: EmailCallbackDeps = {
	getAccount,
	getUser,
	getUserByEmail,
	createCode,
	sendEmail,
	createJwt,
	verifyJwt,
	jwtSecret: new TextEncoder().encode('test-secret-1234567890'),
	baseSiteUrl: 'http://test.com',
	fromEmail: 'noreply@test.com',
	lucia,
	deleteCodesByEmail,
	updateLastLogin
};

function mockEvent(token: string | null) {
	const url = token
		? `http://test.com/login/email/callback?token=${token}`
		: 'http://test.com/login/email/callback';
	// SAFETY: test double — the handler only reads the fields set below.
		return {
		url: new URL(url),
		locals: { user: null },
		cookies: { get: () => undefined, set: vi.fn(), delete: vi.fn() }
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	getAccount.mockResolvedValue(undefined);
	getUser.mockResolvedValue(undefined);
	getUserByEmail.mockResolvedValue({ id: 'user-pw', email: 'pw@user.com' });
	deleteCodesByEmail.mockResolvedValue(undefined);
	lucia.createSession.mockResolvedValue({ id: 'session-pw' });
	lucia.createSessionCookie.mockReturnValue({
		serialize: () => 'auth_session=pw123; Path=/'
	});
	verifyJwt.mockResolvedValue({
		payload: { kind: 'login', email: 'pw@user.com', code: '12345678' }
	});
});

describe('GET /login/email/callback', () => {
	it('redirects password user to /calendar with session cookie', async () => {
		const response = await GET(mockEvent('valid.jwt.token'), deps);

		expect(response.status).toBe(302);
		const location = response.headers.get('Location');
		expect(location).toContain('/calendar');
		expect(getUserByEmail).toHaveBeenCalledWith('pw@user.com');
		expect(deleteCodesByEmail).toHaveBeenCalledWith('pw@user.com');
	});

	it('redirects to /login?error for invalid token', async () => {
		verifyJwt.mockRejectedValue(new Error('invalid token'));

		const response = await GET(mockEvent('invalid-token'), deps);

		expect(response.status).toBe(302);
		const location = response.headers.get('Location');
		expect(location).toContain('/login');
		expect(location).toContain('error');
	});

	it('redirects to /login?error when no token provided', async () => {
		const response = await GET(mockEvent(null), deps);

		expect(response.status).toBe(302);
		const location = response.headers.get('Location');
		expect(location).toContain('/login');
		expect(location).toContain('error');
	});

	it('redirects to /login?error when the token is for another kind', async () => {
		verifyJwt.mockResolvedValue({
			payload: {
				kind: 'signup',
				email: 'pw@user.com',
				firstName: 'P',
				lastName: 'U',
				code: '12345678'
			}
		});

		const response = await GET(mockEvent('signup.kind.token'), deps);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toContain('/login');
		expect(deleteCodesByEmail).not.toHaveBeenCalled();
	});
});
