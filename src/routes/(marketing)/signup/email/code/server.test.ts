import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type SignupCodeDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getHashedCode = vi.fn();
const deleteHashedCode = vi.fn();
const deleteDeadCodes = vi.fn();
const getAccount = vi.fn();
const createNewUser = vi.fn();
const sessionApi = {
	createSession: vi.fn(),
	createSessionCookie: vi.fn()
};

const deps: SignupCodeDeps = {
	getHashedCode,
	deleteHashedCode,
	deleteDeadCodes,
	getAccount,
	createNewUser,
	session: sessionApi
};

const GENERIC_ERROR = { success: false, error: 'Unexpected error, please try again' };
const SIGNUP_BODY = { code: '87654321', email: 'new@user.com' };

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
	getHashedCode.mockResolvedValue({
		code: 'hashed-87654321',
		email: 'new@user.com',
		firstName: 'New',
		lastName: 'User',
		type: 'signup'
	});
	getAccount.mockResolvedValue(undefined);
	createNewUser.mockResolvedValue({ id: 'user-1' });
	sessionApi.createSession.mockResolvedValue({ id: 'session-1', token: 'tok-1' });
	sessionApi.createSessionCookie.mockResolvedValue({
		serialize: () => 'better-auth.session_token=tok-1.sig; Path=/'
	});
});

describe('POST /signup/email/code', () => {
	it('redeems a valid code: creates the user, deletes the code, returns Set-Cookie', async () => {
		const response = await POST(mockEvent(SIGNUP_BODY, 'ip-happy'), deps);

		expect(response.status).toBe(200);
		expect(response.headers.get('Set-Cookie')).toContain('better-auth.session_token');
		expect(createNewUser).toHaveBeenCalledWith('New', 'User', 'new@user.com');
		expect(deleteHashedCode).toHaveBeenCalledWith({
			code: '87654321',
			email: 'new@user.com',
			type: 'signup'
		});
	});

	it('filters the lookup by the posted email and the signup type', async () => {
		await POST(mockEvent(SIGNUP_BODY, 'ip-filter'), deps);

		expect(getHashedCode).toHaveBeenCalledWith({
			code: '87654321',
			email: 'new@user.com',
			type: 'signup'
		});
	});

	it('rejects with a generic 400 when the filtered lookup misses (unknown code, wrong email, or mismatched type)', async () => {
		getHashedCode.mockResolvedValue(undefined);

		const response = await POST(mockEvent(SIGNUP_BODY, 'ip-missing'), deps);

		const body = await response.json();
		expect(response.status).toBe(400);
		expect(body).toEqual(GENERIC_ERROR);
		expect(createNewUser).not.toHaveBeenCalled();
		expect(deleteHashedCode).not.toHaveBeenCalled();
	});

	it.each([
		{ label: 'code missing', body: { email: 'new@user.com' } },
		{ label: 'email missing', body: { code: '87654321' } },
		{ label: 'both missing', body: {} }
	])('rejects with a generic 400 when the request is incomplete ($label)', async ({ body }) => {
		const response = await POST(mockEvent(body, 'ip-incomplete'), deps);

		const bodyJson = await response.json();
		expect(response.status).toBe(400);
		expect(bodyJson).toEqual(GENERIC_ERROR);
		expect(getHashedCode).not.toHaveBeenCalled();
	});

	it('rejects with the existing-account error and burns the code', async () => {
		getAccount.mockResolvedValue({ userId: 'user-9', providerAccountId: 'new@user.com' });

		const response = await POST(mockEvent(SIGNUP_BODY, 'ip-taken'), deps);

		const body = await response.json();
		expect(response.status).toBe(500);
		expect(body).toEqual({ success: false, error: 'Account with this email already Exists' });
		expect(deleteHashedCode).toHaveBeenCalledWith({
			code: '87654321',
			email: 'new@user.com',
			type: 'signup'
		});
		expect(createNewUser).not.toHaveBeenCalled();
	});

	it('rejects with a generic 500 when the code row lacks signup names', async () => {
		getHashedCode.mockResolvedValue({ code: 'hashed-none', email: 'noname@user.com' });

		const response = await POST(
			mockEvent({ code: '11112222', email: 'noname@user.com' }, 'ip-nolabels'),
			deps
		);

		const body = await response.json();
		expect(response.status).toBe(500);
		expect(body).toEqual(GENERIC_ERROR);
		expect(createNewUser).not.toHaveBeenCalled();
		expect(deleteHashedCode).not.toHaveBeenCalled();
	});

	it('returns 429 once the rate limit trips', async () => {
		for (let i = 0; i < 10; i++) {
			const allowed = await POST(mockEvent(SIGNUP_BODY, 'ip-limit'), deps);
			expect(allowed.status).toBe(200);
		}

		const limited = await POST(mockEvent(SIGNUP_BODY, 'ip-limit'), deps);

		expect(limited.status).toBe(429);
		expect(await limited.json()).toEqual({
			success: false,
			error: 'Too many attempts. Try again shortly.'
		});
	});
});
