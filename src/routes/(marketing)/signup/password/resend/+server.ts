import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { getUser } from '$lib/server/db/actions/users';
import { createCode } from '$lib/server/db/actions/codes';
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
import { PASSWORD_VERIFY_CALLBACK_PATH } from '../verifyPath';

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type PasswordResendDeps = {
	getUser: typeof getUser;
	createCode: typeof createCode;
	sendEmail: typeof sendEmail;
	createJwt: typeof createJWT;
	fromEmail: string;
	jwtSecret: Uint8Array;
	baseSiteUrl: string;
	gate?: MagicLinkGate;
};

const defaultDeps: PasswordResendDeps = {
	getUser,
	createCode,
	sendEmail,
	createJwt: createJWT,
	fromEmail: NOREPLYEMAIL,
	jwtSecret: new TextEncoder().encode(EMAILSECRET),
	baseSiteUrl: getUrl()
};

// Authenticated resend for password users: acts only on the caller's own
// email (never reveals other users' state). Same callback path and
// per-email gate bucket as the signup route, so the emailed code+link lands
// on the verify endpoint above.
export const POST = async (
	event: RequestEvent,
	deps: PasswordResendDeps = defaultDeps
): Promise<Response> => {
	const { request, locals } = event;

	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const userId = locals.user.id;

	if (!rateLimit(clientKey(request, `pw-resend:${userId}`), 5, 15 * 60 * 1000)) {
		return json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
	}

	if (!rateLimit(clientKey(request, 'pw-resend-ip'), 30, 5 * 60 * 1000)) {
		return json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
	}

	const user = await deps.getUser(userId);
	// A session whose user row is gone — or an anonymous row with no email
	// yet — has nothing to resend to, and 401 reveals nothing either way.
	if (!user || !user.email) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Idempotent: already verified, nothing to send.
	if (user.emailVerified) {
		return json({ success: true });
	}

	const gate: MagicLinkGate =
		deps.gate ??
		((key) =>
			rateLimit(
				clientKey(request, key),
				MAGIC_LINK_RATE_LIMIT.limit,
				MAGIC_LINK_RATE_LIMIT.windowMs
			));

	const issued = await issueVerificationCode(
		deps,
		{ email: user.email, firstName: user.firstName, lastName: user.lastName },
		gate,
		{
			callbackPath: PASSWORD_VERIFY_CALLBACK_PATH,
			gateKey: `pw-signup-code:${user.email.toLowerCase()}`,
			emailVariant: 'code-only'
		}
	);

	if (issued.status === 'rejected') {
		if (issued.reason === 'rate-limited') {
			return json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
		}
		return json({ error: 'There was an error. Please try again.' }, { status: 500 });
	}

	return json({ success: true });
};
