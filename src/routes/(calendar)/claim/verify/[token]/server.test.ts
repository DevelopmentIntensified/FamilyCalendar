import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, type ClaimVerifyDeps } from './+server';

const verifyClaimToken = vi.fn<ClaimVerifyDeps['verifyClaimToken']>();
const sessionApi = {
	createSession: vi.fn(),
	createSessionCookie: vi.fn()
};
const setSessionCookie = vi.fn<ClaimVerifyDeps['setSessionCookie']>();

const deps: ClaimVerifyDeps = {
	verifyClaimToken,
	session: sessionApi,
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
		// Restated for #196 slice 1: cookie name moved from lucia's
		// `auth_session` to better-auth's default `better-auth.session_token`.
		sessionApi.createSession.mockResolvedValue({ id: 'session-9', token: 'tok-9' });
		sessionApi.createSessionCookie.mockResolvedValue({
			value: 'better-auth.session_token=tok-9.sig; Path=/'
		});

		const event = mockEvent('guest-1');
		const redirect = await redirectOf(GET(event, deps));

		expect(verifyClaimToken).toHaveBeenCalledWith('tok-1', 'guest-1');
		// Signed into the existing account the guest merged into.
		expect(sessionApi.createSession).toHaveBeenCalledWith('existing-9');
		expect(setSessionCookie).toHaveBeenCalled();
		expect(redirect.status).toBe(302);
		expect(redirect.location).toContain('/calendar');
	});

	it('redirects to the calendar without re-signing when the email is claimed', async () => {
		verifyClaimToken.mockResolvedValue({ outcome: 'claimed', userId: 'guest-1' });

		const redirect = await redirectOf(GET(mockEvent('guest-1'), deps));

		expect(verifyClaimToken).toHaveBeenCalledWith('tok-1', 'guest-1');
		expect(sessionApi.createSession).not.toHaveBeenCalled();
		expect(redirect.status).toBe(302);
		expect(redirect.location).toContain('/calendar');
	});

	it('redirects back to claim with an error when the token is invalid', async () => {
		verifyClaimToken.mockResolvedValue({ outcome: 'invalid' });

		const redirect = await redirectOf(GET(mockEvent('guest-1'), deps));

		expect(sessionApi.createSession).not.toHaveBeenCalled();
		expect(redirect.status).toBe(302);
		expect(redirect.location).toContain('/claim?error=invalid');
	});
});
