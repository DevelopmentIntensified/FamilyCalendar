import { sendEmail } from '$lib/utils/sendEmail';
import { type RequestEvent } from '@sveltejs/kit';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { accounts, codes } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { and, eq } from 'drizzle-orm';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'lucia';
import { generateRandomString, type RandomReader } from '@oslojs/crypto/random';
import { createCode } from '$lib/server/db/actions/codes';
import { getAccount } from '$lib/server/db/actions/accounts';

export type emailTokenPayloadType = {
	email: string;
	firstName: string;
	lastName: string;
};

export const POST = async (event: RequestEvent) => {
	const data = await event.request.json();
	const { email, firstName, lastName } = data;

	const emailRegex =
		/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

	if (!emailRegex.test(email)) {
		return new Response(JSON.stringify({ success: false, error: 'Invalid email' }), {
			status: 400
		});
	} else if (!firstName || !lastName || firstName === '' || lastName === '') {
		return new Response(
			JSON.stringify({ success: false, error: 'First and last name are required' }),
			{ status: 400 }
		);
	}

	const account = await getAccount(email);

	if (account) {
		return new Response(JSON.stringify({ success: false, error: 'Email already registered' }), {
			status: 400
		});
	} else {
		const random: RandomReader = {
			read(bytes) {
				crypto.getRandomValues(bytes);
			}
		};
		const nums = '0123456789';

		const secret = new TextEncoder().encode(EMAILSECRET);
		const code = generateRandomString(random, nums, 8);

		const token = await createJWT(
			'HS256',
			secret,
			{
				email,
				firstName,
				lastName,
				code
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
		signInUrl.pathname = '/signup/email/callback';
		signInUrl.searchParams.set('token', token);

		const { success, error, data } = await sendEmail({
			to: email,
			from: NOREPLYEMAIL,
			subject: 'Family Planz Email Confirmation for ' + email,
			html: `<h1>Here is the code to use for logging in: ${code}</h1>
			or if you would rather, here is a link for loggin in: <a href="${signInUrl.toString()}"> link </a>
`
		});

		if (success) {
			await createCode({
				code,
				expiresAt: new Date(Date.now() + 60 * 1000 * 15),
				email,
				firstName,
				lastName,
				emailId: data?.id || null
			});

			return new Response(JSON.stringify({ success: true }), { status: 200 });
		}
		console.log(JSON.stringify(error));
		return new Response(
			JSON.stringify({ success: false, error: 'There was an error. Please try again.' }),
			{ status: 500 }
		);
	}
};
