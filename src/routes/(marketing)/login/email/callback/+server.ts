import { parseJWT, validateJWT } from 'oslo/jwt';
import type { RequestHandler } from '../../../../login/email/callback/$types';
import { getUrl } from '$lib/utils/getUrl';
import { EMAILSECRET } from '$env/static/private';
import type { EmailTokenPayload } from '../+server';
import { lucia } from '$lib/server/auth';
import { accounts, users } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getAccount } from '$lib/server/db/actions/accounts';

export const GET: RequestHandler = async function (event) {
	const requestUrl = new URL(event.url);
	const siteUrl = getUrl();
	const redirectUrl = new URL(siteUrl + '/login');
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
	const payload: EmailTokenPayload = parcedToken?.payload as EmailTokenPayload;

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
				Location: redirectUrl.toString()
			}
		});
	}

	try {
		const { email } = payload;
		const userAccount = await getAccount(email);
		if (userAccount.length === 0) {
			return new Response(null, {
				status: 302,
				headers: {
					Location: redirectUrl.toString()
				}
			});
		}
		let userId = userAccount.userId;

		await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, userId));
		const session = await lucia.createSession(userId, {});
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
