import type { RequestHandler } from '../../../../signup/email/code/$types';
import { getUrl } from '$lib/utils/getUrl';
import { lucia } from '$lib/server/auth';
import { accounts, users } from '$lib/server/db/schema';
import { db } from '$lib/server/db/';
import { eq } from 'drizzle-orm';
import { deleteCode, deleteDeadCodes, getCode } from '$lib/server/db/actions/codes';
import { createNewUser } from '$lib/server/utils/createNewUser';

export const POST: RequestHandler = async function (event) {
	const siteUrl = getUrl();
	const redirectUrl = new URL(siteUrl + '/signup');
	redirectUrl.searchParams.set('error', 'The code incorrect. Please try again');
	const code = (await event.request.json()).code;
	console.warn('DEBUGPRINT[1]: +server.ts:14: code=', code);

	await deleteDeadCodes();

	const codeToCheck = await getCode(code);
	if (!codeToCheck) {
		return new Response(
			JSON.stringify({ success: false, error: 'Unexpected error, please try again' }),
			{ status: 500 }
		);
	}

	try {
		const { firstName, lastName, email } = codeToCheck;
		if (!email || !lastName || !firstName) {
			return new Response(
				JSON.stringify({ success: false, error: 'Unexpected error, please try again' }),
				{ status: 500 }
			);
		}

		const userAccount = await db
			.select()
			.from(accounts)
			.where(eq(accounts.providerAccountId, email));
		if (userAccount.length !== 0) {
			await deleteCode(code);
			return new Response(
				JSON.stringify({ success: false, error: 'Account with this email already Exists' }),
				{ status: 500 }
			);
		}

		const user = await createNewUser(firstName, lastName, email);

		const session = await lucia.createSession(user.id, {});
		const sessionCookie = lucia.createSessionCookie(session.id);

		let headers = new Headers();
		headers.append('Set-Cookie', sessionCookie.serialize());

		let result = new Response(null, {
			status: 200,
			headers
		});

		await deleteCode(code);

		return result;
	} catch (error) {
		console.log(error);
		return new Response(
			JSON.stringify({ success: false, error: 'Unexpected error, please try again' }),
			{ status: 500 }
		);
	}
};
