import { parseJWT, validateJWT } from 'oslo/jwt';
import type { RequestHandler } from '../../../../../../signup/email/callback/$types';
import { getUrl } from '$lib/utils/getUrl';
import { EMAILSECRET } from '$env/static/private';
import type { emailTokenPayloadType } from '../+server';
import { accounts, familyMembers } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { createNewUser } from '$lib/server/utils/createNewUser';
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
	const payload: emailTokenPayloadType = parcedToken?.payload as emailTokenPayloadType;

	if (!payload) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: redirectUrl.toString()
			}
		});
	}

	try {
		const { firstName, lastName, email, familyId } = payload;
		const userAccount = await getAccount(email);

		if (!userAccount) {
			const user = await createNewUser(firstName, lastName, email);
			await db.insert(familyMembers).values({
				userId: user.id,
				familyId: familyId
			});
		} else {
			await db.insert(familyMembers).values({
				userId: userAccount.userId,
				familyId: familyId
			});
		}

		let headers = new Headers();
		headers.append('Location', siteUrl + '/family/' + familyId);

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
