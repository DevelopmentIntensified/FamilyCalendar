import { parseJWT, validateJWT } from 'oslo/jwt';
import type { RequestHandler } from '../../../../signup/email/callback/$types';
import { getUrl } from '$lib/utils/getUrl';
import { EMAILSECRET } from '$env/static/private';
import type { emailTokenPayloadType } from '../+server';
import { generateId } from 'lucia';
import { lucia } from '$lib/server/auth';
import { accounts } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { createUser } from '$lib/server/db/actions/users';
import { createAccount } from '$lib/server/db/actions/accounts';
import { createNewUser } from '$lib/server/utils/createNewUser';

export const GET: RequestHandler = async function (event) {
	const requestUrl = new URL(event.url);
	const siteUrl = getUrl();
	const redirectUrl = new URL(siteUrl + '/signup');
	const token = requestUrl.searchParams.get('token') as string;
	const secret = new TextEncoder().encode(EMAILSECRET);

	redirectUrl.searchParams.set('error', 'The token provided was not valid, please try again.');

	if (!requestUrl.searchParams.has('token')) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: redirectUrl.toString()
			}
		});
	}

	try {
		await validateJWT('HS256', secret, token);
	} catch (error) {
		console.log(error);
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
	const payload: emailTokenPayloadType = parcedToken?.payload as emailTokenPayloadType;

	if (!payload) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: redirectUrl.toString()
			}
		});
	}

	if (!!event.locals.user) {
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

		let headers = new Headers();
		headers.append('Set-Cookie', sessionCookie.serialize());
		headers.append('Location', siteUrl + '/calendar/');

		let result = new Response(null, {
			status: 302,
			headers
		});

		return result;
	} catch (error) {
		console.log(error);
		return new Response(null, {
			status: 302,
			headers: {
				Location: redirectUrl.toString()
			}
		});
	}
};
