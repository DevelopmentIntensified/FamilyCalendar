import { json, type RequestEvent } from '@sveltejs/kit';
import { EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'lucia';
import { db } from '$lib/server/db';
import { familyMembers } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

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

	const emailRegex =
		/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

	if (!emailRegex.test(email)) {
		return json({ success: false, error: 'Invalid email' }, { status: 400 });
	} else if (!firstName || !lastName || firstName === '' || lastName === '') {
		return json({ success: false, error: 'First and last name are required' }, { status: 400 });
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

	const siteUrl = getUrl();
	const link = `${siteUrl}/family/invite/email?token=${token}`;

	return json({ success: true, link });
};
