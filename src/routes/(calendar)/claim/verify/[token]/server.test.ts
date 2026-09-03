import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/services/claimService', () => ({
	verifyClaimToken: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
	lucia: {
		createSession: vi.fn(),
		createSessionCookie: vi.fn()
	},
	setSessionCookie: vi.fn()
}));

import { GET } from './+server';
import { verifyClaimToken } from '$lib/server/services/claimService';
import { lucia, setSessionCookie } from '$lib/server/auth';

function mockEvent(userId: string | null) {
	return {
		locals: { user: userId ? { id: userId } : null },
		params: { token: 'tok-1' },
		cookies: { set: vi.fn() }
	} as never;
}

function redirectOf(promise: unknown): Promise<{ status: number; location: string }> {
	return Promise.resolve(promise).catch(
		(e: unknown) => e as { status: number; location: string }
	) as Promise<{ status: number; location: string }>;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('GET /claim/verify/[token]', () => {
	it('redirects to login when unauthenticated', async () => {
		const redirect = await redirectOf(GET(mockEvent(null)));

		expect(redirect.status).toBe(302);
		expect(redirect.location).toBe('/login');
		expect(verifyClaimToken).not.toHaveBeenCalled();
	});

	it('signs in as the merged account on Claim Conflict and redirects to the calendar', async () => {
		vi.mocked(verifyClaimToken).mockResolvedValue({ outcome: 'merged', targetUserId: 'existing-9' });
		vi.mocked(lucia.createSession).mockResolvedValue({ id: 'session-9' } as never);
		vi.mocked(lucia.createSessionCookie).mockReturnValue({ value: 'auth_session=s9; Path=/' } as never);

		const event = mockEvent('guest-1');
		const redirect = await redirectOf(GET(event));

		expect(verifyClaimToken).toHaveBeenCalledWith('tok-1', 'guest-1');
		// Signed into the existing account the guest merged into.
		expect(lucia.createSession).toHaveBeenCalledWith('existing-9', {});
		expect(setSessionCookie).toHaveBeenCalled();
		expect(redirect.status).toBe(302);
		expect(redirect.location).toContain('/calendar');
	});

	it('redirects to the calendar without re-signing when the email is claimed', async () => {
		vi.mocked(verifyClaimToken).mockResolvedValue({ outcome: 'claimed', userId: 'guest-1' });

		const redirect = await redirectOf(GET(mockEvent('guest-1')));

		expect(verifyClaimToken).toHaveBeenCalledWith('tok-1', 'guest-1');
		expect(lucia.createSession).not.toHaveBeenCalled();
		expect(redirect.status).toBe(302);
		expect(redirect.location).toContain('/calendar');
	});

	it('redirects back to claim with an error when the token is invalid', async () => {
		vi.mocked(verifyClaimToken).mockResolvedValue({ outcome: 'invalid' });

		const redirect = await redirectOf(GET(mockEvent('guest-1')));

		expect(lucia.createSession).not.toHaveBeenCalled();
		expect(redirect.status).toBe(302);
		expect(redirect.location).toContain('/claim?error=invalid');
	});
});
