import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type LoginCodeDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getHashedCode = vi.fn();
const deleteHashedCode = vi.fn();
const deleteDeadCodes = vi.fn();
const getAccount = vi.fn();
const getUserByEmail = vi.fn();
const sessionApi = {
	createSession: vi.fn(),
	createSessionCookie: vi.fn(),
	invalidateSession: vi.fn()
};

const deps: LoginCodeDeps = {
	getHashedCode,
	deleteHashedCode,
	deleteDeadCodes,
	getAccount,
	getUserByEmail,
	session: sessionApi
};

const GENERIC_ERROR = { success: false, error: 'Unexpected error, please try again' };

// SAFETY: test double — POST only reads request.json(), the clientKey header,
// and event.cookies.
function mockEvent(body: Record<string, unknown>, ip: string) {
	return {
		request: {
			json: () => Promise.resolve(body),
			headers: { get: () => ip }
		},
		cookies: { get: () => undefined, set: () => {} }
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	deleteDeadCodes.mockResolvedValue(undefined);
	deleteHashedCode.mockResolvedValue(undefined);
	getHashedCode.mockResolvedValue({ code: 'hashed-123', email: 'password@user.com' });
	getAccount.mockResolvedValue(undefined);
	getUserByEmail.mockResolvedValue({ email: 'password@user.com' });
	sessionApi.createSession.mockResolvedValue({ id: 'session-123', token: 'abc123' });
	sessionApi.createSessionCookie.mockResolvedValue({
		serialize: () => 'better-auth.session_token=abc123.sig; Path=/'
	});
});

const postedBody = { code: '12345678', email: 'password@user.com' };

describe('POST /login/email/code', () => {
	it('redeems a valid code: mints a session, deletes the code, returns Set-Cookie', async () => {
		const response = await POST(mockEvent(postedBody, 'ip-happy'), deps);

		expect(response.status).toBe(200);
		expect(response.headers.get('Set-Cookie')).toContain('better-auth.session_token');
		expect(getUserByEmail).toHaveBeenCalledWith('password@user.com');
		expect(deleteHashedCode).toHaveBeenCalledWith({
			code: '12345678',
			email: 'password@user.com',
			type: 'login'
		});
	});

	it.each([
		{ label: 'no matching row', filter: 'no-row' },
		{ label: 'mismatched type (row stamped signup, consumer login)', filter: 'no-row' },
		{ label: 'email mismatch (row email differs from posted email)', filter: 'no-row' }
	])(
		'rejects with a generic 400 when the filtered lookup misses ($label)',
		async () => {
			getHashedCode.mockResolvedValue(undefined);

			const response = await POST(mockEvent(postedBody, 'ip-missing'), deps);

			const body = await response.json();
			expect(response.status).toBe(400);
			expect(body).toEqual(GENERIC_ERROR);
			expect(sessionApi.createSession).not.toHaveBeenCalled();
			expect(deleteHashedCode).not.toHaveBeenCalled();
		}
	);

	it('filters the lookup by the posted email and the login type', async () => {
		await POST(mockEvent(postedBody, 'ip-filter'), deps);

		expect(getHashedCode).toHaveBeenCalledWith({
			code: '12345678',
			email: 'password@user.com',
			type: 'login'
		});
	});

	it.each([
		{ label: 'code missing', body: { email: 'password@user.com' } },
		{ label: 'email missing', body: { code: '12345678' } },
		{ label: 'both missing', body: {} }
	])('rejects with a generic 400 when the request is incomplete ($label)', async ({ body }) => {
		const response = await POST(mockEvent(body, 'ip-incomplete'), deps);

		const bodyJson = await response.json();
		expect(response.status).toBe(400);
		expect(bodyJson).toEqual(GENERIC_ERROR);
		expect(getHashedCode).not.toHaveBeenCalled();
	});

	it('returns 500 for unknown user (existing semantics retained)', async () => {
		getHashedCode.mockResolvedValue({ code: 'hashed-456', email: 'unknown@user.com' });
		getUserByEmail.mockResolvedValue(undefined);

		const response = await POST(
			mockEvent({ code: '45678901', email: 'unknown@user.com' }, 'ip-unknown-user'),
			deps
		);

		const body = await response.json();
		expect(response.status).toBe(500);
		expect(body.error).toBe('No Account found');
	});

	it('returns 200 for an email (accounts-record) user', async () => {
		getAccount.mockResolvedValue({ userId: 'user-456', providerAccountId: 'email@user.com' });
		getHashedCode.mockResolvedValue({ code: 'hashed-789', email: 'email@user.com' });
		sessionApi.createSession.mockResolvedValue({ id: 'session-456', token: 'xyz' });
		sessionApi.createSessionCookie.mockResolvedValue({
			serialize: () => 'better-auth.session_token=xyz.sig; Path=/'
		});

		const response = await POST(
			mockEvent({ code: '78901234', email: 'email@user.com' }, 'ip-email-user'),
			deps
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('Set-Cookie')).toContain('better-auth.session_token');
	});

	it('returns 429 once the rate limit trips', async () => {
		for (let i = 0; i < 10; i++) {
			const allowed = await POST(mockEvent(postedBody, 'ip-limit'), deps);
			expect(allowed.status).toBe(200);
		}

		const limited = await POST(mockEvent(postedBody, 'ip-limit'), deps);

		expect(limited.status).toBe(429);
		expect(await limited.json()).toEqual({
			success: false,
			error: 'Too many attempts. Try again shortly.'
		});
	});
});
