import { sendEmail } from '$lib/utils/sendEmail';
import { type RequestEvent } from '@sveltejs/kit';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'lucia';

export type emailTokenPayloadType = {
	email: string;
	firstName: string;
	lastName: string;
	familyId: string;
};

export const POST = async (event: RequestEvent) => {
	const rData = await event.request.json();
	const { email, firstName, lastName } = rData;
	const user = event.locals.user;

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

	const secret = new TextEncoder().encode(EMAILSECRET);

	const token = await createJWT(
		'HS256',
		secret,
		{
			email,
			firstName,
			lastName,
			familyId: event.params.familyId
		},
		{
			headers: {
				alg: 'HS256',
				typ: 'JWT'
			},
			expiresIn: new TimeSpan(1, 'd')
		}
	);

	const signInUrl = new URL(getUrl());
	signInUrl.pathname = '/family' + event.params.familyId + '/members/add/email/callback';
	signInUrl.searchParams.set('token', token);

	const { success, error, data } = await sendEmail({
		to: email,
		from: NOREPLYEMAIL,
		subject: 'You have been invited to join a family by ' + user.FirstName + ' ' + user.LastName,
		html: `
			Here is a link for joining: <a href="${signInUrl.toString()}"> link </a>
It will Expire in 24hrs.
`
	});

	if (success) {
		return new Response(JSON.stringify({ success: true }), { status: 200 });
	}
	console.log(JSON.stringify(error));
	return new Response(
		JSON.stringify({ success: false, error: 'There was an error. Please try again.' }),
		{ status: 500 }
	);
};
