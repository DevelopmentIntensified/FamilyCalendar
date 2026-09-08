import {
	consumeMagicLink,
	magicLinkDeps,
	sessionCookieFor,
	type MagicLinkDeps
} from '$lib/server/services/magicLink';
import type { RequestEvent } from '@sveltejs/kit';
import { createNewUser } from '$lib/server/utils/createNewUser';

/**
 * Collaborators GET needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 * Token verification is single-sourced in the magicLink module (parity with
 * the login callback).
 */
export type SignupEmailCallbackDeps = MagicLinkDeps & {
	createNewUser: typeof createNewUser;
};

const defaultDeps: SignupEmailCallbackDeps = {
	...magicLinkDeps,
	createNewUser
};

export const GET = async function (
	event: RequestEvent,
	deps: SignupEmailCallbackDeps = defaultDeps
): Promise<Response> {
	// Remember any anonymous session so its data can be merged after auth.
	const { stashGuestFromCookies } = await import('$lib/server/services/guestMergeService');
	await stashGuestFromCookies(event.cookies);

	const token = new URL(event.url).searchParams.get('token');

	const redirectUrl = new URL(deps.baseSiteUrl + '/signup');
	redirectUrl.searchParams.set('error', 'The token provided was not valid, please try again.');
	const redirect = (location: string) =>
		new Response(null, { status: 302, headers: { Location: location } });
	const errorRedirect = () => redirect(redirectUrl.toString());

	if (token === null) {
		return errorRedirect();
	}

	// Single-source token verify: signature/expiry, kind tag and payload shape.
	const consumed = await consumeMagicLink(deps, token, 'signup');
	if (!consumed.ok) {
		return errorRedirect();
	}

	if (event.locals.user?.email) {
		return redirect(deps.baseSiteUrl + '/calendar/');
	}

	try {
		const { firstName, lastName, email } = consumed.payload;
		const userAccount = await deps.getAccount(email);
		if (userAccount) {
			return redirect(deps.baseSiteUrl + '/calendar/');
		}

		const user = await deps.createNewUser(firstName ?? '', lastName ?? '', email);

		const { cookie } = await sessionCookieFor(deps, user.id);

		const headers = new Headers();
		headers.append('Set-Cookie', cookie.serialize());
		headers.append('Location', deps.baseSiteUrl + '/calendar/');

		return new Response(null, { status: 302, headers });
	} catch {
		return errorRedirect();
	}
};
