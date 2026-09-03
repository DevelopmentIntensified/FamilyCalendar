import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyClaimToken } from '$lib/server/services/claimService';
import { lucia, setSessionCookie } from '$lib/server/auth';

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) {
		throw redirect(302, '/login');
	}

	const result = await verifyClaimToken(event.params.token || '', event.locals.user.id);

	if (result.outcome === 'invalid') {
		throw redirect(302, '/claim?error=invalid');
	}

	if (result.outcome === 'merged') {
		// The guest session was just deleted by the merge — sign the user into
		// the existing account they merged into.
		const session = await lucia.createSession(result.targetUserId, {});
		setSessionCookie(event.cookies, lucia.createSessionCookie(session.id));
	}

	throw redirect(302, '/calendar?claimed=1');
};
