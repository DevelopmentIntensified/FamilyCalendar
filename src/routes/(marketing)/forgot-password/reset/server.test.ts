import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/db/actions/users', () => ({
	getUserByEmail: vi.fn(),
	updateUser: vi.fn()
}));

vi.mock('$lib/server/db/actions/codes', () => ({
	getCode: vi.fn(),
	createCode: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
	lucia: {
		invalidateUserSessions: vi.fn()
	}
}));

vi.mock('$lib/server/utils/password', () => ({
	hashPassword: vi.fn()
}));

vi.mock('$env/static/private', () => ({
	EMAILSECRET: 'test-secret-1234567890'
}));

vi.mock('oslo/jwt', () => ({
	validateJWT: vi.fn(),
	parseJWT: vi.fn()
}));

import { POST } from './+server';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('POST /forgot-password/reset', () => {
	it('resets password with valid token and password', async () => {
		const { validateJWT, parseJWT } = await import('oslo/jwt');
		const { getUserByEmail, updateUser } = await import('$lib/server/db/actions/users');
		const { getCode, createCode } = await import('$lib/server/db/actions/codes');
		const { hashPassword } = await import('$lib/server/utils/password');
		const { lucia } = await import('$lib/server/auth');

		vi.mocked(validateJWT).mockResolvedValue(undefined as never);
		vi.mocked(parseJWT).mockReturnValue({ payload: { email: 'user@test.com' } } as any);
		vi.mocked(getUserByEmail).mockResolvedValue({ id: 'user-1', email: 'user@test.com' } as any);
		vi.mocked(hashPassword).mockResolvedValue('hashed-password');

		const response = await POST({
			request: { json: () => Promise.resolve({ token: 'valid.jwt', password: 'newPassword123' }) }
		} as any);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(updateUser).toHaveBeenCalledWith('user-1', { passwordHash: 'hashed-password' });
		expect(createCode).toHaveBeenCalledTimes(1);
		expect(vi.mocked(createCode).mock.calls[0][0].code).toMatch(/^used:[0-9a-f]{64}$/);
		expect(lucia.invalidateUserSessions).toHaveBeenCalledWith('user-1');
	});

	it('returns 400 for invalid/expired token', async () => {
		const { validateJWT } = await import('oslo/jwt');

		vi.mocked(validateJWT).mockRejectedValue(new Error('invalid token'));

		const response = await POST({
			request: { json: () => Promise.resolve({ token: 'invalid.jwt', password: 'newPassword123' }) }
		} as any);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain('expired');
	});

	it('returns 400 for short password', async () => {
		const { validateJWT } = await import('oslo/jwt');

		vi.mocked(validateJWT).mockResolvedValue(undefined as never);

		const response = await POST({
			request: { json: () => Promise.resolve({ token: 'valid.jwt', password: '123' }) }
		} as any);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain('8 characters');
	});

	it('returns 400 for missing token', async () => {
		const response = await POST({
			request: { json: () => Promise.resolve({ password: 'newPassword123' }) }
		} as any);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBeDefined();
	});
});
