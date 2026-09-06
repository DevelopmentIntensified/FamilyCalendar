import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type ForgotPasswordDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getUserByEmail = vi.fn();
const sendEmail = vi.fn();
const createJwt = vi.fn();

const deps: ForgotPasswordDeps = {
	getUserByEmail,
	sendEmail,
	createJwt,
	baseSiteUrl: 'http://test.com',
	fromEmail: 'noreply@test.com',
	jwtSecret: new TextEncoder().encode('test-secret-1234567890')
};

// SAFETY: test double — POST only reads request.json() for the email field.
function mockEvent(body: { email?: string }) {
	return (
		// SAFETY: test double — POST only reads request.json() for the email field.
		{
			request: { json: () => Promise.resolve(body) }
		} as never
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('POST /forgot-password', () => {
	it('sends reset email for existing user', async () => {
		getUserByEmail.mockResolvedValue({
			id: 'user-1',
			email: 'existing@user.com'
		});
		createJwt.mockResolvedValue('mock.jwt.token');
		sendEmail.mockResolvedValue({
			success: true,
			error: undefined,
			data: { id: 'email-1' }
		});

		const response = await POST(mockEvent({ email: 'existing@user.com' }), deps);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: 'existing@user.com',
				subject: expect.stringContaining('Reset')
			})
		);
	});

	it('returns generic success for unknown email (no info leak)', async () => {
		getUserByEmail.mockResolvedValue(undefined);

		const response = await POST(mockEvent({ email: 'unknown@user.com' }), deps);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.error).toContain('account exists');
	});

	it('returns 400 for missing email', async () => {
		const response = await POST(mockEvent({}), deps);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBeDefined();
	});
});
