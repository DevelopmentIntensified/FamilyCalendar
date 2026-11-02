import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { getUserByEmail } from '$lib/server/db/actions/users';
import { sendEmail } from '$lib/utils/sendEmail';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'oslo';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import { isRegisteredAccount } from '$lib/utils/anonymous';

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type ForgotPasswordDeps = {
	getUserByEmail: typeof getUserByEmail;
	sendEmail: typeof sendEmail;
	createJwt: typeof createJWT;
	baseSiteUrl: string;
	fromEmail: string;
	jwtSecret: Uint8Array;
};

const defaultDeps: ForgotPasswordDeps = {
	getUserByEmail,
	sendEmail,
	createJwt: createJWT,
	baseSiteUrl: getUrl(),
	fromEmail: NOREPLYEMAIL,
	jwtSecret: new TextEncoder().encode(EMAILSECRET)
};

export const POST = async (
	event: RequestEvent,
	deps: ForgotPasswordDeps = defaultDeps
): Promise<Response> => {
	const {
		getUserByEmail: lookupUser,
		sendEmail: mail,
		createJwt,
		baseSiteUrl,
		fromEmail,
		jwtSecret
	} = deps;

	try {
		const { email } = await event.request.json();

		if (!email) {
			return json({ error: 'Email is required' }, { status: 400 });
		}

		if (!rateLimit(clientKey(event.request, `reset:${email.toLowerCase()}`), 5, 15 * 60 * 1000)) {
			return json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
		}

		const user = await lookupUser(email);
		// #245: unknown (or guest placeholder) emails get the exact success
		// shape a real send returns — no enumeration oracle.
		if (!user || !isRegisteredAccount(user)) {
			return json({ success: true });
		}

		const token = await createJwt(
			'HS256',
			jwtSecret,
			{ email },
			{
				headers: { alg: 'HS256', typ: 'JWT' },
				expiresIn: new TimeSpan(60, 'm')
			}
		);

		const resetUrl = new URL(baseSiteUrl);
		resetUrl.pathname = '/forgot-password/reset';
		resetUrl.searchParams.set('token', token);

		await mail({
			to: email,
			from: fromEmail,
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
