import { sendEmail } from '$lib/utils/sendEmail';
import { type RequestEvent } from '@sveltejs/kit';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { accounts } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { and, eq } from 'drizzle-orm';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'lucia';

export type EmailTokenPayload = {
	provider: 'email';
	providerAccountId: string;
	userId: string;
};

export const POST = async (event: RequestEvent) => {
	const data: { email: string } = await event.request.json();
	const email = data.email;

	const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

	if (!emailRegex.test(email)) {
		return new Response(JSON.stringify({ success: false, error: 'Invalid email' }), { status: 400 });
	}

	const account = await db
		.select()
		.from(accounts)
		.where(and(eq(accounts.provider, 'email'), eq(accounts.providerAccountId, email)));

	const secret = new TextEncoder().encode(EMAILSECRET);

	if (account.length !== 0) {
		const token = await createJWT(
			'HS256',
			secret,
			{
				provider: 'email',
				providerAccountId: email,
				userId: account[0].userId
			},
			{
				headers: {
					alg: 'HS256',
					typ: 'JWT'
				},
				expiresIn: new TimeSpan(15, 'm')
			}
		);

		const signInUrl = new URL(getUrl());
		signInUrl.pathname = '/login/email/callback';
		signInUrl.searchParams.set('token', token);

		// const { success, error } = await sendEmail({
		// 	to: email,
		// 	dynamicTemplateData: {
		// 		url: signInUrl.toString(),
		// 		token
		// 	}
		// });

		if (success) {
			return new Response(JSON.stringify({ success: true }), { status: 200 });
		}
		console.log(error);
		return new Response(JSON.stringify({ success: false, error: 'Unexpected error, please try again' }), { status: 500 });
	} else {
		return new Response(JSON.stringify({ success: false, error: 'No account found, please register or try another email' }), { status: 400, statusText: 'Bad Request' });
	}
};
