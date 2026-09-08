import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type LoginEmailDeps } from './+server';

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
const gate = vi.fn(() => true);

const deps: LoginEmailDeps = {
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
	gate
};

// SAFETY: test double — POST only reads request.json() and event.request
// via clientKey (headers are optional-chained there).
function mockEvent(body: { email: string }) {
	// SAFETY: test double — the handler only reads the fields set below.
		return {
		request: {
			json: () => Promise.resolve(body),
			headers: { get: () => 'test-ip' }
		}
	} as never;
}

const GENERIC_SUCCESS = {
	success: true,
	message: "If that email has an account, we've sent a login link."
};

beforeEach(() => {
	vi.clearAllMocks();
	getAccount.mockResolvedValue(undefined);
	getUser.mockResolvedValue(undefined);
	getUserByEmail.mockResolvedValue(undefined);
	sendEmail.mockResolvedValue({ success: true, error: undefined, data: { id: 'email-1' } });
	createJwt.mockResolvedValue('mock.jwt.token');
});

describe('POST /login/email', () => {
	it('creates a code and sends the login email for a known user', async () => {
		getUserByEmail.mockResolvedValue({ id: 'user-1', firstName: 'Known', lastName: 'User' });

		const response = await POST(mockEvent({ email: 'known@user.com' }), deps);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual(GENERIC_SUCCESS);
		expect(createCode).toHaveBeenCalledTimes(1);
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(sendEmail.mock.calls[0][0].to).toBe('known@user.com');
	});

	it('returns the same success body for an unknown email (no leak)', async () => {
		const response = await POST(mockEvent({ email: 'ghost@user.com' }), deps);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual(GENERIC_SUCCESS);
		expect(createCode).not.toHaveBeenCalled();
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('returns 400 for an invalid email', async () => {
		const response = await POST(mockEvent({ email: 'not-an-email' }), deps);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.success).toBe(false);
	});

	it('returns 429 when the rate limit trips', async () => {
		gate.mockReturnValueOnce(false);

		const response = await POST(mockEvent({ email: 'flood@user.com' }), deps);

		const body = await response.json();

		expect(response.status).toBe(429);
		expect(body.success).toBe(false);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('uses a generic error when the email fails to send', async () => {
		getUserByEmail.mockResolvedValue({ id: 'user-1', firstName: 'K', lastName: 'U' });
		sendEmail.mockResolvedValue({ success: false, error: 'smtp down', data: undefined });

		const response = await POST(mockEvent({ email: 'send-fail@user.com' }), deps);

		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.success).toBe(false);
	});
});
