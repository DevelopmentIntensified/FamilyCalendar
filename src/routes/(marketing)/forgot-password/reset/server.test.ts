import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type ResetPasswordDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getUserByEmail = vi.fn();
const updateUser = vi.fn();
const getCode = vi.fn();
const createCode = vi.fn();
const hashPassword = vi.fn();
const invalidateUserSessions = vi.fn();
const verifyJwt = vi.fn();
const parseJwt = vi.fn();

const deps: ResetPasswordDeps = {
	getUserByEmail,
	updateUser,
	getCode,
	createCode,
	hashPassword,
	invalidateUserSessions,
	jwtSecret: new TextEncoder().encode('test-secret-1234567890'),
	verifyJwt,
	parseJwt
};

// SAFETY: test double — POST only reads request.json() for token/password.
function mockEvent(body: { token?: string; password?: string }) {
	return (
		// SAFETY: test double — POST only reads request.json() for token/password.
		{
			request: { json: () => Promise.resolve(body) }
		} as never
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('POST /forgot-password/reset', () => {
	it('resets password with valid token and password', async () => {
		parseJwt.mockReturnValue({ payload: { email: 'user@test.com' } });
		getUserByEmail.mockResolvedValue({ id: 'user-1', email: 'user@test.com' });
		hashPassword.mockResolvedValue('hashed-password');

		const response = await POST(
			mockEvent({ token: 'valid.jwt', password: 'newPassword123' }),
			deps
		);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(updateUser).toHaveBeenCalledWith('user-1', { passwordHash: 'hashed-password' });
		expect(createCode).toHaveBeenCalledTimes(1);
		expect(createCode.mock.calls[0][0].code).toMatch(/^used:[0-9a-f]{64}$/);
		expect(invalidateUserSessions).toHaveBeenCalledWith('user-1');
	});

	it('returns 400 for invalid/expired token', async () => {
		verifyJwt.mockRejectedValue(new Error('invalid token'));

		const response = await POST(
			mockEvent({ token: 'invalid.jwt', password: 'newPassword123' }),
			deps
		);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain('expired');
	});

	it('returns 400 for short password', async () => {
		const response = await POST(mockEvent({ token: 'valid.jwt', password: '123' }), deps);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain('8 characters');
	});

	it('returns 400 for missing token', async () => {
		const response = await POST(mockEvent({ password: 'newPassword123' }), deps);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBeDefined();
	});
});
