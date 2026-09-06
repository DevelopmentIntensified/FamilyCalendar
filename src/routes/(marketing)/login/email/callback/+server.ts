import { parseJWT, validateJWT } from 'oslo/jwt';
import type { RequestEvent } from './$types';
import { getUrl } from '$lib/utils/getUrl';
import { EMAILSECRET } from '$env/static/private';
import type { EmailTokenPayload } from '../+server';
import { lucia } from '$lib/server/auth';
import { users } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getAccount } from '$lib/server/db/actions/accounts';
import { getUserByEmail } from '$lib/server/db/actions/users';
import { deleteCodesByEmail } from '$lib/server/db/actions/codes';

/**
 * Collaborators GET needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type EmailCallbackDeps = {
	getAccount: typeof getAccount;
	getUserByEmail: typeof getUserByEmail;
	deleteCodesByEmail: typeof deleteCodesByEmail;
	lucia: Pick<typeof lucia, 'createSession' | 'createSessionCookie' | 'invalidateSession'>;
	updateLastLogin: (userId: string) => Promise<void> | void;
	baseSiteUrl: string;
	jwtSecret: Uint8Array;
	verifyJwt: typeof validateJWT;
	parseJwt: typeof parseJWT;
};

function isEmailTokenPayload(value: unknown): value is EmailTokenPayload {
	return (
		typeof value === 'object' &&
		value !== null &&
		'email' in value &&
		typeof value.email === 'string'
	);
}

const defaultDeps: EmailCallbackDeps = {
	getAccount,
	getUserByEmail,
	deleteCodesByEmail,
	lucia,
	updateLastLogin: async (userId: string) => {
		await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, userId));
	},
	baseSiteUrl: getUrl(),
	jwtSecret: new TextEncoder().encode(EMAILSECRET),
	verifyJwt: validateJWT,
	parseJwt: parseJWT
};

export const GET = async function (
	event: RequestEvent,
	deps: EmailCallbackDeps = defaultDeps
): Promise<Response> {
	const {
		getAccount: lookupAccount,
		getUserByEmail: lookupUser,
		deleteCodesByEmail,
		lucia: session,
		updateLastLogin,
		baseSiteUrl,
		jwtSecret,
		verifyJwt,
		parseJwt
	} = deps;

	// Remember any anonymous session so its data can be merged after auth.
	const { stashGuestFromCookies } = await import('$lib/server/services/guestMergeService');
	await stashGuestFromCookies(event.cookies);

	const requestUrl = new URL(event.url);
	const redirectUrl = new URL(baseSiteUrl + '/login');
	const token = requestUrl.searchParams.get('token');

	redirectUrl.searchParams.set('error', 'The token provided was not valid, please try again.');

	if (token === null) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: redirectUrl.toString()
			}
		});
	}

	try {
		await verifyJwt('HS256', jwtSecret, token);
	} catch {
		return new Response(null, {
			status: 302,
			headers: {
				Location: redirectUrl.toString()
			}
		});
	}

	const parcedToken = parseJwt(token);
	if (!parcedToken) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: redirectUrl.toString()
			}
		});
	}
	const payload: unknown = parcedToken.payload;

	if (!isEmailTokenPayload(payload)) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: redirectUrl.toString()
			}
		});
	}

	if (event.locals.user) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: redirectUrl.toString()
			}
		});
	}

	try {
		const { email } = payload;
		let userAccount: { userId: string } | null = await lookupAccount(email);
		if (!userAccount) {
			const user = await lookupUser(email);
			if (!user) {
				return new Response(null, {
					status: 302,
					headers: {
						Location: redirectUrl.toString()
					}
				});
			}
			userAccount = { userId: user.id };
		}
		const userId = userAccount.userId;

		const oldSessionId = event.locals.session?.id;
		const oldUser = event.locals.user;

		await updateLastLogin(userId);
		const sessionRecord = await session.createSession(userId, {});
		const sessionCookie = session.createSessionCookie(sessionRecord.id);

		if (
			oldSessionId &&
			oldUser &&
			!oldUser.email &&
			oldUser.id !== userId &&
			oldSessionId !== sessionRecord.id
		) {
			await session.invalidateSession(oldSessionId).catch(() => {});
		}

		await deleteCodesByEmail(email);

		const headers = new Headers();
		headers.append('Set-Cookie', sessionCookie.serialize());
		headers.append('Location', baseSiteUrl + '/calendar/');

		const result = new Response(null, {
			status: 302,
			headers
		});

		return result;
	} catch {
		return new Response(null, {
			status: 302,
			headers: {
				Location: redirectUrl.toString()
			}
		});
	}
};
