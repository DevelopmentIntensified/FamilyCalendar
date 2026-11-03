import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { getUserByEmail, createUser } from '$lib/server/db/actions/users';
import { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
import { createCode } from '$lib/server/db/actions/codes';
import { hashPassword } from '$lib/server/utils/password';
import { session, setSessionCookie } from '$lib/server/auth';
import type { MagicLinkGate } from '$lib/server/services/magicLink';
import { sendEmail } from '$lib/utils/sendEmail';
import { createJWT } from 'oslo/jwt';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import {
	createPasswordAccount,
	sendSignupVerification
} from '$lib/server/services/passwordSignup';

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type SignupPasswordDeps = {
	getUserByEmail: typeof getUserByEmail;
	createUser: typeof createUser;
	ensurePersonalCalendar: typeof ensurePersonalCalendar;
	hashPassword: typeof hashPassword;
	session: Pick<typeof session, 'createSession' | 'createSessionCookie'>;
	setSessionCookie: typeof setSessionCookie;
	createCode: typeof createCode;
	sendEmail: typeof sendEmail;
	createJwt: typeof createJWT;
	fromEmail: string;
	jwtSecret: Uint8Array;
	baseSiteUrl: string;
	gate?: MagicLinkGate;
};

const defaultDeps: SignupPasswordDeps = {
	getUserByEmail,
	createUser,
	ensurePersonalCalendar,
	hashPassword,
	session,
	setSessionCookie,
	createCode,
	sendEmail,
	createJwt: createJWT,
	fromEmail: NOREPLYEMAIL,
	jwtSecret: new TextEncoder().encode(EMAILSECRET),
	baseSiteUrl: getUrl()
};

export const POST = async (
	event: RequestEvent,
	deps: SignupPasswordDeps = defaultDeps
): Promise<Response> => {
	const { request, cookies } = event;
	// Remember any anonymous session so its data can be merged after auth.
	const { stashGuestFromCookies } = await import('$lib/server/services/guestMergeService');
	await stashGuestFromCookies(cookies);

	try {
		const body = await request.json();
		// Validation, throttles and account creation are shared with
		// POST /api/mobile/auth/signup (#292 G12).
		const created = await createPasswordAccount(request, body, deps);
		if (!created.ok) return created.response;
		const { user } = created;
		const { email, firstName, lastName } = body;

		const newSession = await deps.session.createSession(user.id);
		deps.setSessionCookie(cookies, await deps.session.createSessionCookie(newSession));

		// The account already exists and is signed in at this point, so a
		// verification-email failure must not fail the signup: logged, and the
		// 201 pending shape is kept. The resend path covers recovery.
		await sendSignupVerification(request, deps, { email, firstName, lastName });

		return json(
			{
				success: true,
				user: { id: user.id, email: user.email, firstName: user.firstName },
				emailVerification: 'pending'
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Signup error:', error);
		return json({ error: 'Failed to create account' }, { status: 500 });
	}
};
