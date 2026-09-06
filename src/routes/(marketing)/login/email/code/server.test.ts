import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type LoginCodeDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getCode = vi.fn();
const deleteCode = vi.fn();
const deleteDeadCodes = vi.fn();
const getAccount = vi.fn();
const getUserByEmail = vi.fn();
const lucia = {
	createSession: vi.fn(),
	createSessionCookie: vi.fn(),
	invalidateSession: vi.fn()
};

const deps: LoginCodeDeps = {
	getCode,
	deleteCode,
	deleteDeadCodes,
	getAccount,
	getUserByEmail,
	lucia
};

function mockEvent(code: string) {
	return (
		// SAFETY: test double — POST only reads request.json() and event.cookies.
		{
			request: {
				json: () => Promise.resolve({ code })
			}
		} as never
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('POST /login/email/code', () => {
	it('returns 200 for password user (no accounts record)', async () => {
		const mockCode = { code: 'ABC123', email: 'password@user.com' };
		const mockUser = { id: 'user-123', email: 'password@user.com' };

		getCode.mockResolvedValue(mockCode);
		getAccount.mockResolvedValue(undefined);
		getUserByEmail.mockResolvedValue(mockUser);
		lucia.createSession.mockResolvedValue({ id: 'session-123' });
		lucia.createSessionCookie.mockReturnValue({
			serialize: () => 'auth_session=abc123; Path=/'
		});

		const response = await POST(mockEvent('ABC123'), deps);

		expect(response.status).toBe(200);
		expect(response.headers.get('Set-Cookie')).toContain('auth_session');
		expect(getUserByEmail).toHaveBeenCalledWith('password@user.com');
		expect(deleteCode).toHaveBeenCalledWith('ABC123');
	});

	it('returns 500 for unknown user', async () => {
		getCode.mockResolvedValue({ code: 'DEF456', email: 'unknown@user.com' });
		getAccount.mockResolvedValue(undefined);
		getUserByEmail.mockResolvedValue(undefined);

		const response = await POST(mockEvent('DEF456'), deps);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toBe('No Account found');
	});

	it('returns 200 for email user (has accounts record)', async () => {
		getCode.mockResolvedValue({ code: 'GHI789', email: 'email@user.com' });
		getAccount.mockResolvedValue({
			userId: 'user-456',
			providerAccountId: 'email@user.com'
		});
		lucia.createSession.mockResolvedValue({ id: 'session-456' });
		lucia.createSessionCookie.mockReturnValue({
			serialize: () => 'auth_session=xyz; Path=/'
		});

		const response = await POST(mockEvent('GHI789'), deps);

		expect(response.status).toBe(200);
		expect(deleteCode).toHaveBeenCalledWith('GHI789');
	});
});
