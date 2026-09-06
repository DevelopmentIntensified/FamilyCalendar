import { sendEmail } from '$lib/utils/sendEmail';
import { type RequestEvent } from '@sveltejs/kit';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'lucia';
import { generateRandomString, type RandomReader } from '@oslojs/crypto/random';
import { createCode } from '$lib/server/db/actions/codes';
import { getAccount } from '$lib/server/db/actions/accounts';
import { getUserByEmail } from '$lib/server/db/actions/users';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

export type emailTokenPayloadType = {
	email: string;
	firstName: string;
	lastName: string;
};

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type SignupEmailDeps = {
	getAccount: typeof getAccount;
	getUserByEmail: typeof getUserByEmail;
	sendEmail: typeof sendEmail;
	createCode: typeof createCode;
	createJwt: typeof createJWT;
	baseSiteUrl: string;
	fromEmail: string;
	jwtSecret: Uint8Array;
};

const defaultDeps: SignupEmailDeps = {
	getAccount,
	getUserByEmail,
	sendEmail,
	createCode,
	createJwt: createJWT,
	baseSiteUrl: getUrl(),
	fromEmail: NOREPLYEMAIL,
	jwtSecret: new TextEncoder().encode(EMAILSECRET)
};

export const POST = async (
	event: RequestEvent,
	deps: SignupEmailDeps = defaultDeps
): Promise<Response> => {
	const data = await event.request.json();
	const { email, firstName, lastName } = data;

	const emailRegex =
		/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

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

	if (
		!rateLimit(clientKey(event.request, `signup-code:${email.toLowerCase()}`), 5, 15 * 60 * 1000)
	) {
		return new Response(
			JSON.stringify({ success: false, error: 'Too many attempts. Try again shortly.' }),
			{ status: 429 }
		);
	}

	const account = await deps.getAccount(email);
	const existingUser = await deps.getUserByEmail(email);

	if (account || existingUser) {
		// Same success shape as the happy path — never reveal that the email is
		// already registered. No code is created or sent on this branch.
		return new Response(JSON.stringify({ success: true }), { status: 200 });
	}

	const random: RandomReader = {
		read(bytes) {
			crypto.getRandomValues(bytes);
		}
	};
	const nums = '0123456789';

	const secret = deps.jwtSecret;
	const code = generateRandomString(random, nums, 8);

	const token = await deps.createJwt(
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

	const signInUrl = new URL(deps.baseSiteUrl);
	signInUrl.pathname = '/signup/email/callback';
	signInUrl.searchParams.set('token', token);

	const { success, data: emailData } = await deps.sendEmail({
		to: email,
		from: deps.fromEmail,
		subject: 'Family Planz Email Confirmation for ' + email,
		html: `<h1>Here is the code to use for logging in: ${code}</h1>
			or if you would rather, here is a link for loggin in: <a href="${signInUrl.toString()}"> link </a>
`
	});

	if (success) {
		await deps.createCode({
			code,
			expiresAt: new Date(Date.now() + 60 * 1000 * 15),
			email,
			firstName,
			lastName,
			emailId: emailData?.id || null
		});

		return new Response(JSON.stringify({ success: true }), { status: 200 });
	}
	return new Response(
		JSON.stringify({ success: false, error: 'There was an error. Please try again.' }),
		{ status: 500 }
	);
};
