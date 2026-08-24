import { sendEmail } from '$lib/utils/sendEmail';
import { json, type RequestEvent } from '@sveltejs/kit';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'lucia';
import { db } from '$lib/server/db';
import { familyMembers } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export type emailTokenPayloadType = {
	email: string;
	firstName: string;
	lastName: string;
	familyId: string;
};

export const POST = async (event: RequestEvent) => {
	if (!event.locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [member] = await db
		.select({ userId: familyMembers.userId })
		.from(familyMembers)
		.where(
			and(
				eq(familyMembers.familyId, event.params.familyId!),
				eq(familyMembers.userId, event.locals.user.id)
			)
		)
		.limit(1);

	if (!member) {
		return json({ error: 'Not a member of this family' }, { status: 403 });
	}

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
	signInUrl.pathname = '/family/invite/email';
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
	return new Response(
		JSON.stringify({ success: false, error: 'There was an error. Please try again.' }),
		{ status: 500 }
	);
};
