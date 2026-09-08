import type { RequestEvent } from '@sveltejs/kit';
import {
	consumeMagicLink,
	magicLinkDeps,
	sessionCookieFor,
	type MagicLinkDeps
} from '$lib/server/services/magicLink';
import { lucia } from '$lib/server/auth';
import { users } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { deleteCodesByEmail } from '$lib/server/db/actions/codes';

/**
 * Collaborators GET needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 * Token verification is single-sourced in the magicLink module.
 */
export type EmailCallbackDeps = Omit<MagicLinkDeps, 'lucia'> & {
	lucia: Pick<typeof lucia, 'createSession' | 'createSessionCookie' | 'invalidateSession'>;
	deleteCodesByEmail: typeof deleteCodesByEmail;
	updateLastLogin: (userId: string) => Promise<void> | void;
};

const defaultDeps: EmailCallbackDeps = {
	...magicLinkDeps,
	lucia,
	deleteCodesByEmail,
	updateLastLogin: async (userId: string) => {
		await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, userId));
	}
};

export const GET = async function (
	event: RequestEvent,
	deps: EmailCallbackDeps = defaultDeps
): Promise<Response> {
	// Remember any anonymous session so its data can be merged after auth.
	const { stashGuestFromCookies } = await import('$lib/server/services/guestMergeService');
	await stashGuestFromCookies(event.cookies);

	const token = new URL(event.url).searchParams.get('token');

	const redirectUrl = new URL(deps.baseSiteUrl + '/login');
	redirectUrl.searchParams.set('error', 'The token provided was not valid, please try again.');
	const redirect = (location: string) =>
		new Response(null, { status: 302, headers: { Location: location } });
	const errorRedirect = () => redirect(redirectUrl.toString());

	if (token === null) {
		return errorRedirect();
	}

	// Single-source token verify: signature/expiry, kind tag and payload shape.
	const consumed = await consumeMagicLink(deps, token, 'login');
	if (!consumed.ok) {
		return errorRedirect();
	}

	if (event.locals.user) {
		return errorRedirect();
	}

	try {
		const { email } = consumed.payload;
		let userAccount: { userId: string } | null = await deps.getAccount(email);
		if (!userAccount) {
			const user = await deps.getUserByEmail(email);
			if (!user) {
				return errorRedirect();
			}
			userAccount = { userId: user.id };
		}
		const userId = userAccount.userId;

		const oldSessionId = event.locals.session?.id;
		const oldUser = event.locals.user;

		await deps.updateLastLogin(userId);
		const { sessionId, cookie } = await sessionCookieFor(deps, userId);

		if (
			oldSessionId &&
			oldUser &&
			!oldUser.email &&
			oldUser.id !== userId &&
			oldSessionId !== sessionId
		) {
			await deps.lucia.invalidateSession(oldSessionId).catch(() => {});
		}

		await deps.deleteCodesByEmail(email);

		const headers = new Headers();
		headers.append('Set-Cookie', cookie.serialize());
		headers.append('Location', deps.baseSiteUrl + '/calendar/');

		return new Response(null, { status: 302, headers });
	} catch {
		return errorRedirect();
	}
};
