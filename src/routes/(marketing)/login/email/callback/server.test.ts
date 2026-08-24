import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/db/actions/accounts', () => ({
	getAccount: vi.fn()
}));

vi.mock('$lib/server/db/actions/users', () => ({
	getUserByEmail: vi.fn()
}));

vi.mock('$lib/server/db/actions/codes', () => ({
	deleteCodesByEmail: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
	lucia: {
		createSession: vi.fn(),
		createSessionCookie: vi.fn()
	}
}));

vi.mock('$lib/utils/getUrl', () => ({
	getUrl: vi.fn(() => 'http://test.com')
}));

vi.mock('$lib/server/db', () => ({
	db: {
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve())
			}))
		}))
	}
}));

vi.mock('$lib/server/db/schema', () => ({
	users: {},
	accounts: {}
}));

vi.mock('$env/static/private', () => ({
	EMAILSECRET: 'test-secret-1234567890'
}));

vi.mock('oslo/jwt', () => ({
	validateJWT: vi.fn(),
	parseJWT: vi.fn()
}));

import { GET } from './+server';

function mockEvent(token: string | null) {
	const url = token ? `http://test.com/login/email/callback?token=${token}` : 'http://test.com/login/email/callback';
	return {
		url: new URL(url),
		locals: { user: null }
	} as any;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('GET /login/email/callback', () => {
	it('redirects password user to /calendar with session cookie', async () => {
		const { validateJWT, parseJWT } = await import('oslo/jwt');
		const { getAccount } = await import('$lib/server/db/actions/accounts');
		const { getUserByEmail } = await import('$lib/server/db/actions/users');
		const { deleteCodesByEmail } = await import('$lib/server/db/actions/codes');
		const { lucia } = await import('$lib/server/auth');

		vi.mocked(validateJWT).mockResolvedValue(undefined as any);
		vi.mocked(parseJWT).mockReturnValue({ payload: { email: 'pw@user.com' } } as any);
		vi.mocked(getAccount).mockResolvedValue(undefined as any);
		vi.mocked(getUserByEmail).mockResolvedValue({ id: 'user-pw', email: 'pw@user.com' } as any);
		vi.mocked(lucia.createSession).mockResolvedValue({ id: 'session-pw' } as any);
		vi.mocked(lucia.createSessionCookie).mockReturnValue({ serialize: () => 'auth_session=pw123; Path=/' } as any);

		const response = await GET(mockEvent('valid.jwt.token'));

		expect(response.status).toBe(302);
		const location = response.headers.get('Location');
		expect(location).toContain('/calendar');
		expect(getUserByEmail).toHaveBeenCalledWith('pw@user.com');
		expect(deleteCodesByEmail).toHaveBeenCalledWith('pw@user.com');
	});

	it('redirects to /login?error for invalid token', async () => {
		const { validateJWT } = await import('oslo/jwt');
		vi.mocked(validateJWT).mockRejectedValue(new Error('invalid token'));

		const response = await GET(mockEvent('invalid-token'));

		expect(response.status).toBe(302);
		const location = response.headers.get('Location');
		expect(location).toContain('/login');
		expect(location).toContain('error');
	});

	it('redirects to /login?error when no token provided', async () => {
		const response = await GET(mockEvent(null));

		expect(response.status).toBe(302);
		const location = response.headers.get('Location');
		expect(location).toContain('/login');
		expect(location).toContain('error');
	});
});
