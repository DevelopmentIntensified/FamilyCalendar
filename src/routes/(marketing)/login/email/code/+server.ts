import type { RequestHandler } from '../../../../login/email/code/$types';
import { getUrl } from '$lib/utils/getUrl';
import { lucia } from '$lib/server/auth';
import { deleteCode, deleteDeadCodes, getCode } from '$lib/server/db/actions/codes';
import { getAccount } from '$lib/server/db/actions/accounts';

export const POST: RequestHandler = async function (event) {
	const siteUrl = getUrl();
	const redirectUrl = new URL(siteUrl + '/login');
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
		const email = codeToCheck.email;
		if (!email) {
			return new Response(
				JSON.stringify({ success: false, error: 'Unexpected error, please try again' }),
				{ status: 500 }
			);
		}

		let userAccount = await getAccount(email);
		if (!userAccount) {
			return new Response(JSON.stringify({ success: false, error: 'No Account found' }), {
				status: 500
			});
		}

		const session = await lucia.createSession(userAccount.userId, {});
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
