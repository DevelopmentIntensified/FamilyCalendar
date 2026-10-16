import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { getUserByEmail, createUser } from '$lib/server/db/actions/users';
import { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
import { createCode } from '$lib/server/db/actions/codes';
import { hashPassword } from '$lib/server/utils/password';
import { lucia, setSessionCookie } from '$lib/server/auth';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import {
	issueVerificationCode,
	MAGIC_LINK_RATE_LIMIT,
	type MagicLinkGate
} from '$lib/server/services/magicLink';
import { sendEmail } from '$lib/utils/sendEmail';
import { createJWT } from 'oslo/jwt';
import { NOREPLYEMAIL, EMAILSECRET } from '$env/static/private';
import { getUrl } from '$lib/utils/getUrl';
import { PASSWORD_VERIFY_CALLBACK_PATH } from './verifyPath';

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type SignupPasswordDeps = {
	getUserByEmail: typeof getUserByEmail;
	createUser: typeof createUser;
	ensurePersonalCalendar: typeof ensurePersonalCalendar;
	hashPassword: typeof hashPassword;
	lucia: Pick<typeof lucia, 'createSession' | 'createSessionCookie'>;
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
	lucia,
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
		const { email, password, firstName, lastName } = await request.json();

		if (!email || !password || !firstName || !lastName) {
			return json({ error: 'All fields are required' }, { status: 400 });
		}

		if (password.length < 8) {
			return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
		}

		if (!rateLimit(clientKey(request, 'pw-signup-ip'), 30, 5 * 60 * 1000)) {
			return json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
		}

		if (!rateLimit(clientKey(request, `pw-signup:${email.toLowerCase()}`), 10, 5 * 60 * 1000)) {
			return json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
		}

		const existingUser = await deps.getUserByEmail(email);
		if (existingUser) {
			return json({ error: 'An account with this email already exists' }, { status: 400 });
		}

		const passwordHash = await deps.hashPassword(password);

		const user = await deps.createUser({
			email,
			passwordHash,
			firstName,
			lastName,
			emailVerified: false,
			roles: []
		});

		await deps.ensurePersonalCalendar(user.id);

		const session = await deps.lucia.createSession(user.id, {});
		deps.setSessionCookie(cookies, deps.lucia.createSessionCookie(session.id));

		// The account already exists and is signed in at this point, so a
		// verification-email failure must not fail the signup: log and keep
		// the 201 pending shape. The resend path (slice 3) covers recovery.
		const gate: MagicLinkGate =
			deps.gate ??
			((key) =>
				rateLimit(
					clientKey(request, key),
					MAGIC_LINK_RATE_LIMIT.limit,
					MAGIC_LINK_RATE_LIMIT.windowMs
				));
		try {
			const issued = await issueVerificationCode(
				deps,
				{ email, firstName, lastName },
				gate,
				{
					callbackPath: PASSWORD_VERIFY_CALLBACK_PATH,
					gateKey: `pw-signup-code:${email.toLowerCase()}`,
					emailVariant: 'code-only'
				}
			);
			if (issued.status === 'rejected') {
				console.error(`Verification email not sent for ${email}: ${issued.reason}`);
			}
		} catch (emailError) {
			console.error(`Verification email not sent for ${email}:`, emailError);
		}

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
