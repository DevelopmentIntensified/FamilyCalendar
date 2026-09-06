import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, type EmailCallbackDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getAccount = vi.fn();
const getUserByEmail = vi.fn();
const deleteCodesByEmail = vi.fn();
const lucia = {
	createSession: vi.fn(),
	createSessionCookie: vi.fn(),
	invalidateSession: vi.fn()
};
const updateLastLogin = vi.fn();
const verifyJwt = vi.fn();
const parseJwt = vi.fn();

const deps: EmailCallbackDeps = {
	getAccount,
	getUserByEmail,
	deleteCodesByEmail,
	lucia,
	updateLastLogin,
	baseSiteUrl: 'http://test.com',
	jwtSecret: new TextEncoder().encode('test-secret-1234567890'),
	verifyJwt,
	parseJwt
};

function mockEvent(token: string | null) {
	const url = token
		? `http://test.com/login/email/callback?token=${token}`
		: 'http://test.com/login/email/callback';
	return (
		// SAFETY: test double — GET only reads event.url and locals.user/session.
		{
			url: new URL(url),
			locals: { user: null }
		} as never
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('GET /login/email/callback', () => {
	it('redirects password user to /calendar with session cookie', async () => {
		parseJwt.mockReturnValue({ payload: { email: 'pw@user.com' } });
		getUserByEmail.mockResolvedValue({ id: 'user-pw', email: 'pw@user.com' });
		lucia.createSession.mockResolvedValue({ id: 'session-pw' });
		lucia.createSessionCookie.mockReturnValue({
			serialize: () => 'auth_session=pw123; Path=/'
		});

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
});
