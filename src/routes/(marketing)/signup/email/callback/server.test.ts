import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, type SignupEmailCallbackDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getAccount = vi.fn();
const getUser = vi.fn();
const getUserByEmail = vi.fn();
const createCode = vi.fn();
const sendEmail = vi.fn();
const createJwt = vi.fn();
const verifyJwt = vi.fn();
const lucia = { createSession: vi.fn(), createSessionCookie: vi.fn() };
const createNewUser = vi.fn();

const deps: SignupEmailCallbackDeps = {
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
	createNewUser
};

function mockEvent(token: string | null, user: { email?: string } | null = null) {
	const url = token
		? `http://test.com/signup/email/callback?token=${token}`
		: 'http://test.com/signup/email/callback';
	// SAFETY: test double — the handler only reads the fields set below.
		return {
		url: new URL(url),
		locals: { user },
		cookies: { get: () => undefined, set: vi.fn(), delete: vi.fn() }
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	getAccount.mockResolvedValue(undefined);
	getUser.mockResolvedValue(undefined);
	getUserByEmail.mockResolvedValue(undefined);
	createNewUser.mockResolvedValue({ id: 'user-new' });
	lucia.createSession.mockResolvedValue({ id: 'session-1' });
	lucia.createSessionCookie.mockReturnValue({
		serialize: () => 'auth_session=new123; Path=/'
	});
	verifyJwt.mockResolvedValue({
		payload: {
			kind: 'signup',
			email: 'new@user.com',
			firstName: 'New',
			lastName: 'User',
			code: '12345678'
		}
	});
});

describe('GET /signup/email/callback', () => {
	it('creates the user, sets the session cookie and redirects to the calendar', async () => {
		const response = await GET(mockEvent('valid.jwt.token'), deps);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toContain('/calendar');
		expect(response.headers.get('Set-Cookie')).toBe('auth_session=new123; Path=/');
		expect(createNewUser).toHaveBeenCalledWith('New', 'User', 'new@user.com');
		expect(lucia.createSession).toHaveBeenCalledWith('user-new', {});
	});

	it('redirects to /signup?error when no token is provided', async () => {
		const response = await GET(mockEvent(null), deps);

		expect(response.status).toBe(302);
		const location = response.headers.get('Location');
		expect(location).toContain('/signup');
		expect(location).toContain('error');
	});

	it('redirects to /signup?error for an invalid token', async () => {
		verifyJwt.mockRejectedValue(new Error('invalid token'));

		const response = await GET(mockEvent('bad.token'), deps);

		expect(response.status).toBe(302);
		const location = response.headers.get('Location');
		expect(location).toContain('/signup');
		expect(location).toContain('error');
		expect(createNewUser).not.toHaveBeenCalled();
	});

	it('redirects to /signup?error when the token is for another kind', async () => {
		verifyJwt.mockResolvedValue({
			payload: { kind: 'login', email: 'new@user.com', code: '12345678' }
		});

		const response = await GET(mockEvent('login.kind.token'), deps);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toContain('/signup');
		expect(createNewUser).not.toHaveBeenCalled();
	});

	it('redirects an already signed-in user with an email straight to the calendar', async () => {
		const response = await GET(mockEvent('valid.jwt.token', { email: 'me@user.com' }), deps);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toContain('/calendar');
		expect(createNewUser).not.toHaveBeenCalled();
	});

	it('redirects to the calendar without creating a user when the account exists', async () => {
		getAccount.mockResolvedValue({ id: 'account-1', userId: 'user-1' });

		const response = await GET(mockEvent('valid.jwt.token'), deps);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toContain('/calendar');
		expect(createNewUser).not.toHaveBeenCalled();
	});

	it('redirects to /signup?error when user creation fails', async () => {
		createNewUser.mockRejectedValue(new Error('db down'));

		const response = await GET(mockEvent('valid.jwt.token'), deps);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toContain('/signup');
	});
});
