import { parseJWT, validateJWT } from 'oslo/jwt';
import type { RequestHandler } from './$types';
import { getUrl } from '$lib/utils/getUrl';
import { EMAILSECRET } from '$env/static/private';
import type { emailTokenPayloadType } from '../+server';
import { lucia } from '$lib/server/auth';
import { accounts } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { createNewUser } from '$lib/server/utils/createNewUser';

function isEmailTokenPayload(value: unknown): value is emailTokenPayloadType {
	return (
		typeof value === 'object' &&
		value !== null &&
		'email' in value &&
		typeof value.email === 'string' &&
		'firstName' in value &&
		typeof value.firstName === 'string' &&
		'lastName' in value &&
		typeof value.lastName === 'string'
	);
}

export const GET: RequestHandler = async function (event) {
	// Remember any anonymous session so its data can be merged after auth.
	const { stashGuestFromCookies } = await import('$lib/server/services/guestMergeService');
	await stashGuestFromCookies(event.cookies);

	const requestUrl = new URL(event.url);
	const siteUrl = getUrl();
	const redirectUrl = new URL(siteUrl + '/signup');
	const token = requestUrl.searchParams.get('token');
	const secret = new TextEncoder().encode(EMAILSECRET);

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
		await validateJWT('HS256', secret, token);
	} catch {
		return new Response(null, {
			status: 302,
			headers: {
				Location: redirectUrl.toString()
			}
		});
	}

	const parcedToken = parseJWT(token);
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

	if (event.locals.user?.email) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: siteUrl + '/calendar/'
			}
		});
	}

	try {
		const { firstName, lastName, email } = payload;
		const userAccount = await db
			.select()
			.from(accounts)
			.where(eq(accounts.providerAccountId, email));
		if (userAccount.length !== 0) {
			return new Response(null, {
				status: 302,
				headers: {
					Location: siteUrl + '/calendar/'
				}
			});
		}

		const user = await createNewUser(firstName, lastName, email);

		const session = await lucia.createSession(user.id, {});
		const sessionCookie = lucia.createSessionCookie(session.id);

		const headers = new Headers();
		headers.append('Set-Cookie', sessionCookie.serialize());
		headers.append('Location', siteUrl + '/calendar/');

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
