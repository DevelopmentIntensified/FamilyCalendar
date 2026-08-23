import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/db/actions/users', () => ({
	getUserByEmail: vi.fn()
}));

vi.mock('$lib/utils/sendEmail', () => ({
	sendEmail: vi.fn()
}));

vi.mock('$env/static/private', () => ({
	NOREPLYEMAIL: 'noreply@test.com',
	EMAILSECRET: 'test-secret-1234567890'
}));

vi.mock('$lib/utils/getUrl', () => ({
	getUrl: vi.fn(() => 'http://test.com')
}));

vi.mock('oslo/jwt', () => ({
	createJWT: vi.fn()
}));

import { POST } from './+server';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('POST /forgot-password', () => {
	it('sends reset email for existing user', async () => {
		const { getUserByEmail } = await import('$lib/server/db/actions/users');
		const { sendEmail } = await import('$lib/utils/sendEmail');
		const { createJWT } = await import('oslo/jwt');

		vi.mocked(getUserByEmail).mockResolvedValue({ id: 'user-1', email: 'existing@user.com' } as any);
		vi.mocked(createJWT).mockResolvedValue('mock.jwt.token');
		vi.mocked(sendEmail).mockResolvedValue({ success: true, error: undefined, data: { id: 'email-1' } });

		const response = await POST({
			request: { json: () => Promise.resolve({ email: 'existing@user.com' }) }
		} as any);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: 'existing@user.com', subject: expect.stringContaining('Reset') })
		);
	});

	it('returns generic success for unknown email (no info leak)', async () => {
		const { getUserByEmail } = await import('$lib/server/db/actions/users');

		vi.mocked(getUserByEmail).mockResolvedValue(undefined as any);

		const response = await POST({
			request: { json: () => Promise.resolve({ email: 'unknown@user.com' }) }
		} as any);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.error).toContain('account exists');
	});

	it('returns 400 for missing email', async () => {
		const response = await POST({
			request: { json: () => Promise.resolve({}) }
		} as any);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBeDefined();
	});
});
