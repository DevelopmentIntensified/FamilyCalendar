import { sendEmail } from '$lib/utils/sendEmail';
import { type RequestEvent } from '@sveltejs/kit';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'lucia';
import { generateRandomString, type RandomReader } from '@oslojs/crypto/random';
import { getAccount } from '$lib/server/db/actions/accounts';
import { getUser, getUserByEmail } from '$lib/server/db/actions/users';
import { createCode } from '$lib/server/db/actions/codes';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

export type EmailTokenPayload = {
	email: string;
};

export const POST = async (event: RequestEvent) => {
	const emailData = await event.request.json();
	const { email } = emailData;

	const emailRegex =
		/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

	if (!emailRegex.test(email)) {
		return new Response(JSON.stringify({ success: false, error: 'Invalid email' }), {
			status: 400
		});
	}

	if (!rateLimit(clientKey(event.request, `login-code:${email.toLowerCase()}`), 5, 15 * 60 * 1000)) {
		return new Response(
			JSON.stringify({ success: false, error: 'Too many attempts. Try again shortly.' }),
			{ status: 429 }
		);
	}

	let user = null;
	const account = await getAccount(email);
	if (account) {
		user = await getUser(account.userId);
	} else {
		user = await getUserByEmail(email);
	}

	if (!user) {
		// Same response as the known-email path (without sending anything)
		// so this endpoint cannot be used to enumerate registered accounts.
		const genericBody = {
			success: true,
			message: "If that email has an account, we've sent a login link."
		};
		return new Response(JSON.stringify(genericBody), { status: 200 });
	}

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
	signInUrl.pathname = '/login/email/callback';
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
			firstName: user.firstName,
			lastName: user.lastName,
			emailId: data?.id || null
		});

		return new Response(
			JSON.stringify({
				success: true,
				message: "If that email has an account, we've sent a login link."
			}),
			{ status: 200 }
		);
	}
	return new Response(
		JSON.stringify({ success: false, error: 'There was an error. Please try again.' }),
		{ status: 500 }
	);
};
