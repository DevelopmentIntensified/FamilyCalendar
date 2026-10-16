import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type PasswordVerifyDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const getCode = vi.fn();
const deleteCode = vi.fn();
const deleteDeadCodes = vi.fn();
const getUserByEmail = vi.fn();
const updateUser = vi.fn();

const deps: PasswordVerifyDeps = {
	getCode,
	deleteCode,
	deleteDeadCodes,
	getUserByEmail,
	updateUser
};

const GENERIC_ERROR = { success: false, error: 'Unexpected error, please try again' };

// SAFETY: test double — POST only reads request.json() and request.headers
// via clientKey.
function mockEvent(body: { code?: string }, ip: string) {
	// SAFETY: test double — the handler only reads the fields set below.
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
	deleteCode.mockResolvedValue(undefined);
	getCode.mockResolvedValue({
		code: '12345678',
		email: 'new@user.com',
		firstName: 'New',
		lastName: 'User'
	});
	getUserByEmail.mockResolvedValue({
		id: 'user-1',
		email: 'new@user.com',
		emailVerified: false
	});
	updateUser.mockResolvedValue({ id: 'user-1', emailVerified: true });
});

describe('POST /signup/password/verify', () => {
	it('flips emailVerified, deletes the code, and returns success', async () => {
		const response = await POST(mockEvent({ code: '12345678' }, 'ip-happy'), deps);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true });
		expect(updateUser).toHaveBeenCalledWith('user-1', { emailVerified: true });
		expect(deleteCode).toHaveBeenCalledWith('12345678');
	});

	it('returns a generic error for an unknown code without touching the user', async () => {
		getCode.mockResolvedValue(undefined);

		const response = await POST(mockEvent({ code: '00000000' }, 'ip-unknown'), deps);

		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual(GENERIC_ERROR);
		expect(getUserByEmail).not.toHaveBeenCalled();
		expect(updateUser).not.toHaveBeenCalled();
	});

	it('returns a generic error once expiry sweep has run (expired code reads as missing)', async () => {
		getCode.mockResolvedValue(undefined);

		const response = await POST(mockEvent({ code: '99999999' }, 'ip-expired'), deps);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual(GENERIC_ERROR);
		expect(deleteDeadCodes).toHaveBeenCalled();
	});

	it('is idempotent for an already-verified user: success without flipping', async () => {
		getUserByEmail.mockResolvedValue({
			id: 'user-1',
			email: 'new@user.com',
			emailVerified: true
		});

		const response = await POST(mockEvent({ code: '12345678' }, 'ip-verified'), deps);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true });
		expect(updateUser).not.toHaveBeenCalled();
		expect(deleteCode).toHaveBeenCalledWith('12345678');
	});

	it('deletes the orphaned code and stays generic when the user is gone', async () => {
		getUserByEmail.mockResolvedValue(undefined);

		const response = await POST(mockEvent({ code: '12345678' }, 'ip-orphan'), deps);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual(GENERIC_ERROR);
		expect(updateUser).not.toHaveBeenCalled();
		expect(deleteCode).toHaveBeenCalledWith('12345678');
	});

	it('returns 429 once the rate limit trips', async () => {
		for (let i = 0; i < 10; i++) {
			const allowed = await POST(mockEvent({ code: '12345678' }, 'ip-limit'), deps);
			expect(allowed.status).toBe(200);
		}

		const limited = await POST(mockEvent({ code: '12345678' }, 'ip-limit'), deps);

		expect(limited.status).toBe(429);
		expect(await limited.json()).toEqual({
			success: false,
			error: 'Too many attempts. Try again shortly.'
		});
	});
});
