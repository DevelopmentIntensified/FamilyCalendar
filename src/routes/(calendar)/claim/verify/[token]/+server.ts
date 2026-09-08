import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { verifyClaimToken } from '$lib/server/services/claimService';
import { sessionCookieFor } from '$lib/server/services/magicLink';
import { lucia, setSessionCookie } from '$lib/server/auth';

/**
 * Collaborators GET needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Session assembly goes through the magicLink
 * module (shared with the signup/login callbacks); token verification stays in
 * claimService.
 */
export type ClaimVerifyDeps = {
	verifyClaimToken: typeof verifyClaimToken;
	lucia: Pick<typeof lucia, 'createSession' | 'createSessionCookie'>;
	setSessionCookie: typeof setSessionCookie;
};

const defaultDeps: ClaimVerifyDeps = {
	verifyClaimToken,
	lucia,
	setSessionCookie
};

export const GET = async (event: RequestEvent, deps: ClaimVerifyDeps = defaultDeps) => {
	if (!event.locals.user) {
		throw redirect(302, '/login');
	}

	const result = await deps.verifyClaimToken(event.params.token || '', event.locals.user.id);

	if (result.outcome === 'invalid') {
		throw redirect(302, '/claim?error=invalid');
	}

	if (result.outcome === 'merged') {
		// The guest session was just deleted by the merge — sign the user into
		// the existing account they merged into.
		const { cookie } = await sessionCookieFor(deps, result.targetUserId);
		deps.setSessionCookie(event.cookies, cookie);
	}

	throw redirect(302, '/calendar?claimed=1');
};
