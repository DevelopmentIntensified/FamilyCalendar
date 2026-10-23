import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type PasswordVerifyDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getHashedCode = vi.fn();
const deleteHashedCode = vi.fn();
const deleteDeadCodes = vi.fn();
const getUserByEmail = vi.fn();
const verifyUserEmail = vi.fn();

const deps: PasswordVerifyDeps = {
	getHashedCode,
	deleteHashedCode,
	deleteDeadCodes,
	getUserByEmail,
	verifyUserEmail
};

const GENERIC_ERROR = { success: false, error: 'Unexpected error, please try again' };
const VERIFY_BODY = { code: '12345678', email: 'new@user.com' };

// SAFETY: test double — POST only reads request.json() and request.headers
// via clientKey.
function mockEvent(body: Record<string, unknown>, ip: string) {
	return {
		request: {
			json: () => Promise.resolve(body),
			headers: { get: () => ip }
		},
		cookies: { get: () => undefined, set: () => {} }
	} as never;
}

const loginFilter = {
	code: '12345678',
	email: 'new@user.com',
	type: 'password-signup'
};

beforeEach(() => {
	vi.clearAllMocks();
	deleteDeadCodes.mockResolvedValue(undefined);
	deleteHashedCode.mockResolvedValue(undefined);
	getHashedCode.mockResolvedValue({
		code: 'hashed-12345678',
		email: 'new@user.com',
		firstName: 'New',
		lastName: 'User',
		type: 'password-signup'
	});
	getUserByEmail.mockResolvedValue({
		id: 'user-1',
		email: 'new@user.com',
		emailVerified: false
	});
	verifyUserEmail.mockResolvedValue({ id: 'user-1', emailVerified: true });
});

describe('POST /signup/password/verify', () => {
	it('flips emailVerified, deletes the code, and returns success', async () => {
		const response = await POST(mockEvent(VERIFY_BODY, 'ip-happy'), deps);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true });
		expect(getHashedCode).toHaveBeenCalledWith(loginFilter);
		expect(verifyUserEmail).toHaveBeenCalledWith('user-1');
		expect(deleteHashedCode).toHaveBeenCalledWith(loginFilter);
	});

	it('rejects with a generic 400 when the filtered lookup misses (unknown code, wrong email, or mismatched type)', async () => {
		getHashedCode.mockResolvedValue(undefined);

		const response = await POST(mockEvent(VERIFY_BODY, 'ip-missing'), deps);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual(GENERIC_ERROR);
		expect(getUserByEmail).not.toHaveBeenCalled();
		expect(verifyUserEmail).not.toHaveBeenCalled();
		expect(deleteHashedCode).not.toHaveBeenCalled();
	});

	it.each([
		{ label: 'code missing', body: { email: 'new@user.com' } },
		{ label: 'email missing', body: { code: '12345678' } },
		{ label: 'both missing', body: {} }
	])('rejects with a generic 400 when the request is incomplete ($label)', async ({ body }) => {
		const response = await POST(mockEvent(body, 'ip-incomplete'), deps);

		const bodyJson = await response.json();
		expect(response.status).toBe(400);
		expect(bodyJson).toEqual(GENERIC_ERROR);
		expect(getHashedCode).not.toHaveBeenCalled();
	});

	it('is idempotent for an already-verified user: success without flipping', async () => {
		getUserByEmail.mockResolvedValue({
			id: 'user-1',
			email: 'new@user.com',
			emailVerified: true
		});

		const response = await POST(mockEvent(VERIFY_BODY, 'ip-verified'), deps);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true });
		expect(verifyUserEmail).not.toHaveBeenCalled();
		expect(deleteHashedCode).toHaveBeenCalledWith(loginFilter);
	});

	it('deletes the orphaned code and stays generic when the user is gone', async () => {
		getUserByEmail.mockResolvedValue(undefined);

		const response = await POST(mockEvent(VERIFY_BODY, 'ip-orphan'), deps);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual(GENERIC_ERROR);
		expect(verifyUserEmail).not.toHaveBeenCalled();
		expect(deleteHashedCode).toHaveBeenCalledWith(loginFilter);
	});

	it('returns 429 once the rate limit trips', async () => {
		for (let i = 0; i < 10; i++) {
			const allowed = await POST(mockEvent(VERIFY_BODY, 'ip-limit'), deps);
			expect(allowed.status).toBe(200);
		}

		const limited = await POST(mockEvent(VERIFY_BODY, 'ip-limit'), deps);

		expect(limited.status).toBe(429);
		expect(await limited.json()).toEqual({
			success: false,
			error: 'Too many attempts. Try again shortly.'
		});
	});
});
