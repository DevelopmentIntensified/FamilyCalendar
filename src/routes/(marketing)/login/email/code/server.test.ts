import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/db/actions/codes', () => ({
	getCode: vi.fn(),
	deleteCode: vi.fn(),
	deleteDeadCodes: vi.fn()
}));

vi.mock('$lib/server/db/actions/accounts', () => ({
	getAccount: vi.fn()
}));

vi.mock('$lib/server/db/actions/users', () => ({
	getUserByEmail: vi.fn()
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
	db: {}
}));

import { POST } from './+server';

function mockEvent(code: string) {
	return {
		request: {
			json: () => Promise.resolve({ code })
		}
	} as any;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('POST /login/email/code', () => {
	it('returns 200 for password user (no accounts record)', async () => {
		const { getCode, deleteDeadCodes, deleteCode } = await import('$lib/server/db/actions/codes');
		const { getAccount } = await import('$lib/server/db/actions/accounts');
		const { getUserByEmail } = await import('$lib/server/db/actions/users');
		const { lucia } = await import('$lib/server/auth');

		const mockCode = { code: 'ABC123', email: 'password@user.com' };
		const mockUser = { id: 'user-123', email: 'password@user.com' };
		const mockSession = { id: 'session-123' };
		const mockCookie = { serialize: () => 'auth_session=abc123; Path=/' };

		vi.mocked(getCode).mockResolvedValue(mockCode as any);
		vi.mocked(getAccount).mockResolvedValue(undefined as any);
		vi.mocked(getUserByEmail).mockResolvedValue(mockUser as any);
		vi.mocked(lucia.createSession).mockResolvedValue(mockSession as any);
		vi.mocked(lucia.createSessionCookie).mockReturnValue(mockCookie as any);

		const response = await POST(mockEvent('ABC123'));

		expect(response.status).toBe(200);
		expect(response.headers.get('Set-Cookie')).toContain('auth_session');
		expect(getUserByEmail).toHaveBeenCalledWith('password@user.com');
		expect(deleteCode).toHaveBeenCalledWith('ABC123');
	});

	it('returns 500 for unknown user', async () => {
		const { getCode } = await import('$lib/server/db/actions/codes');
		const { getAccount } = await import('$lib/server/db/actions/accounts');
		const { getUserByEmail } = await import('$lib/server/db/actions/users');

		vi.mocked(getCode).mockResolvedValue({ code: 'DEF456', email: 'unknown@user.com' });
		vi.mocked(getAccount).mockResolvedValue(undefined as any);
		vi.mocked(getUserByEmail).mockResolvedValue(undefined as any);

		const response = await POST(mockEvent('DEF456'));
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toBe('No Account found');
	});

	it('returns 200 for email user (has accounts record)', async () => {
		const { getCode, deleteCode } = await import('$lib/server/db/actions/codes');
		const { getAccount } = await import('$lib/server/db/actions/accounts');
		const { lucia } = await import('$lib/server/auth');

		vi.mocked(getCode).mockResolvedValue({ code: 'GHI789', email: 'email@user.com' });
		vi.mocked(getAccount).mockResolvedValue({ userId: 'user-456', providerAccountId: 'email@user.com' } as any);
		vi.mocked(lucia.createSession).mockResolvedValue({ id: 'session-456' } as any);
		vi.mocked(lucia.createSessionCookie).mockReturnValue({ serialize: () => 'auth_session=xyz; Path=/' } as any);

		const response = await POST(mockEvent('GHI789'));

		expect(response.status).toBe(200);
		expect(deleteCode).toHaveBeenCalledWith('GHI789');
	});
});
