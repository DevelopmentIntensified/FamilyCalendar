import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserByEmail } from '$lib/server/db/actions/users';
import { sendEmail } from '$lib/utils/sendEmail';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'lucia';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email } = await request.json();

		if (!email) {
			return json({ error: 'Email is required' }, { status: 400 });
		}

		if (!rateLimit(clientKey(request, `reset:${email.toLowerCase()}`), 5, 15 * 60 * 1000)) {
			return json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
		}

		const user = await getUserByEmail(email);
		if (!user) {
			return json({ error: 'If an account exists, a reset link has been sent' }, { status: 200 });
		}

		const secret = new TextEncoder().encode(EMAILSECRET);
		const token = await createJWT(
			'HS256',
			secret,
			{ email },
			{
				headers: { alg: 'HS256', typ: 'JWT' },
				expiresIn: new TimeSpan(60, 'm')
			}
		);

		const resetUrl = new URL(getUrl());
		resetUrl.pathname = '/forgot-password/reset';
		resetUrl.searchParams.set('token', token);

		await sendEmail({
			to: email,
			from: NOREPLYEMAIL,
			subject: 'Family Planz Password Reset',
			html: `<h1>Password Reset</h1>
				<p>Click the link below to reset your password. This link expires in 60 minutes.</p>
				<a href="${resetUrl.toString()}">Reset Password</a>`
		});

		return json({ success: true });
	} catch (error) {
		console.error('Forgot password error:', error);
		return json({ error: 'Failed to send reset email' }, { status: 500 });
	}
};
