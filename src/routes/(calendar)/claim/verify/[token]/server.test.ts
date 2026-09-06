import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, type ClaimVerifyDeps } from './+server';

const verifyClaimToken = vi.fn<ClaimVerifyDeps['verifyClaimToken']>();
const lucia = {
	createSession: vi.fn(),
	createSessionCookie: vi.fn()
};
const setSessionCookie = vi.fn<ClaimVerifyDeps['setSessionCookie']>();

const deps: ClaimVerifyDeps = {
	verifyClaimToken,
	lucia,
	setSessionCookie
};

function mockEvent(userId: string | null) {
	// SAFETY: test double — GET only reads locals.user, params.token, cookies.set.
	return {
		locals: { user: userId ? { id: userId } : null },
		params: { token: 'tok-1' },
		cookies: { set: vi.fn() }
	} as never;
}

type RedirectLike = { status: number; location: string };

function redirectOf(result: Promise<Response>): Promise<RedirectLike> {
	// SAFETY: SvelteKit's redirect() throws a Redirect object carrying exactly
	// status and location; handlers throw rather than return, so tests recover it.
	return Promise.resolve(result).catch((e) => e as RedirectLike) as Promise<RedirectLike>;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('GET /claim/verify/[token]', () => {
	it('redirects to login when unauthenticated', async () => {
		const redirect = await redirectOf(GET(mockEvent(null), deps));

		expect(redirect.status).toBe(302);
		expect(redirect.location).toBe('/login');
		expect(verifyClaimToken).not.toHaveBeenCalled();
	});

	it('signs in as the merged account on Claim Conflict and redirects to the calendar', async () => {
		verifyClaimToken.mockResolvedValue({
			outcome: 'merged',
			targetUserId: 'existing-9'
		});
		lucia.createSession.mockResolvedValue({ id: 'session-9' });
		lucia.createSessionCookie.mockReturnValue({ value: 'auth_session=s9; Path=/' });

		const event = mockEvent('guest-1');
		const redirect = await redirectOf(GET(event, deps));

		expect(verifyClaimToken).toHaveBeenCalledWith('tok-1', 'guest-1');
		// Signed into the existing account the guest merged into.
		expect(lucia.createSession).toHaveBeenCalledWith('existing-9', {});
		expect(setSessionCookie).toHaveBeenCalled();
		expect(redirect.status).toBe(302);
		expect(redirect.location).toContain('/calendar');
	});

	it('redirects to the calendar without re-signing when the email is claimed', async () => {
		verifyClaimToken.mockResolvedValue({ outcome: 'claimed', userId: 'guest-1' });

		const redirect = await redirectOf(GET(mockEvent('guest-1'), deps));

		expect(verifyClaimToken).toHaveBeenCalledWith('tok-1', 'guest-1');
		expect(lucia.createSession).not.toHaveBeenCalled();
		expect(redirect.status).toBe(302);
		expect(redirect.location).toContain('/calendar');
	});

	it('redirects back to claim with an error when the token is invalid', async () => {
		verifyClaimToken.mockResolvedValue({ outcome: 'invalid' });

		const redirect = await redirectOf(GET(mockEvent('guest-1'), deps));

		expect(lucia.createSession).not.toHaveBeenCalled();
		expect(redirect.status).toBe(302);
		expect(redirect.location).toContain('/claim?error=invalid');
	});
});
