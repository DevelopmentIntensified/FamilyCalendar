import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { verifyClaimToken } from '$lib/server/services/claimService';
import { sessionCookieFor } from '$lib/server/services/magicLink';
import { session, setSessionCookie } from '$lib/server/auth';

/**
 * Collaborators need injecting so tests can pass fakes through a real seam
 * instead of mocking modules. Session assembly goes through the magicLink
 * module (shared with the signup/login callbacks); token verification stays
 * in claimService. GET only renders the confirm page — the single-use token
 * is consumed exclusively by POST (issue 163), so prefetchers and link
 * scanners can never trigger the burn + guest merge.
 */
export type ClaimVerifyDeps = {
	verifyClaimToken: typeof verifyClaimToken;
	session: Pick<typeof session, 'createSession' | 'createSessionCookie'>;
	setSessionCookie: typeof setSessionCookie;
};

const defaultDeps: ClaimVerifyDeps = {
	verifyClaimToken,
	session,
	setSessionCookie
};

function confirmPage(token: string): Response {
	const action = `/claim/verify/${encodeURIComponent(token)}`;
	const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Save your calendar</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;">
<div style="max-width:28rem;margin:4rem auto;padding:0 1.5rem;">
<h1 style="font-size:1.5rem;margin:0 0 .75rem;">Save your calendar</h1>
<p style="font-size:.875rem;color:#475569;margin:0 0 1.5rem;">Confirming will add your email to this device's calendar and sync it across devices. This link can be used once and expires in 15 minutes.</p>
<form method="POST" action="${action}"><button type="submit" style="width:100%;padding:.75rem;border:0;border-radius:9999px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;">Confirm claim</button></form>
<p style="text-align:center;margin-top:1.5rem;"><a href="/claim" style="color:#64748b;font-size:.875rem;">Cancel</a></p>
</div></body></html>`;
	return new Response(body, {
		status: 200,
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
}

export const GET = async (event: RequestEvent): Promise<Response> => {
	if (!event.locals.user) {
		throw redirect(302, '/login');
	}
	return confirmPage(event.params.token || '');
};

export const POST = async (event: RequestEvent, deps: ClaimVerifyDeps = defaultDeps) => {
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
