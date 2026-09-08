import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type SignupEmailDeps } from './+server';

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

const deps: SignupEmailDeps = {
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
function mockEvent(body: { email: string; firstName?: string; lastName?: string }) {
	// SAFETY: test double — the handler only reads the fields set below.
		return {
		request: {
			json: () => Promise.resolve(body),
			headers: { get: () => 'test-ip' }
		}
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	getAccount.mockResolvedValue(undefined);
	getUser.mockResolvedValue(undefined);
	getUserByEmail.mockResolvedValue(undefined);
	sendEmail.mockResolvedValue({ success: true, error: undefined, data: { id: 'email-1' } });
	createJwt.mockResolvedValue('mock.jwt.token');
});

describe('POST /signup/email', () => {
	it('creates a code and sends email for a new email', async () => {
		const response = await POST(
			mockEvent({ email: 'new@user.com', firstName: 'New', lastName: 'User' }),
			deps
		);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true });
		expect(createCode).toHaveBeenCalledTimes(1);
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(sendEmail.mock.calls[0][0].to).toBe('new@user.com');
	});

	it('returns the same success shape for an already-registered account (no leak)', async () => {
		getAccount.mockResolvedValue({ id: 'account-1', email: 'taken@user.com' });

		const response = await POST(
			mockEvent({ email: 'taken@user.com', firstName: 'Taken', lastName: 'User' }),
			deps
		);

		const body = await response.json();

		// Same shape as the happy path — no error field, no distinct status.
		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true });
		// No code is actually created or sent on this branch.
		expect(createCode).not.toHaveBeenCalled();
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('returns the same success shape for an already-registered user (no leak)', async () => {
		getUserByEmail.mockResolvedValue({ id: 'user-1', email: 'taken@user.com' });

		const response = await POST(
			mockEvent({ email: 'taken@user.com', firstName: 'Taken', lastName: 'User' }),
			deps
		);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true });
		expect(createCode).not.toHaveBeenCalled();
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('uses a generic error when the email fails to send', async () => {
		sendEmail.mockResolvedValue({ success: false, error: 'smtp down', data: undefined });

		const response = await POST(
			mockEvent({ email: 'send-fail@user.com', firstName: 'Send', lastName: 'Fail' }),
			deps
		);

		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.success).toBe(false);
	});

	it('returns 400 for an invalid email', async () => {
		const response = await POST(
			mockEvent({ email: 'not-an-email', firstName: 'Bad', lastName: 'Email' }),
			deps
		);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.success).toBe(false);
	});

	it('returns 400 when first or last name are missing', async () => {
		const response = await POST(mockEvent({ email: 'new@user.com', firstName: 'New' }), deps);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.success).toBe(false);
	});

	it('returns 429 when the rate limit trips', async () => {
		gate.mockReturnValueOnce(false);

		const response = await POST(
			mockEvent({ email: 'flood@user.com', firstName: 'F', lastName: 'L' }),
			deps
		);

		const body = await response.json();

		expect(response.status).toBe(429);
		expect(body.success).toBe(false);
		expect(sendEmail).not.toHaveBeenCalled();
	});
});
