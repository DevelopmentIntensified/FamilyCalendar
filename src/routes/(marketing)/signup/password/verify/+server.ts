import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import {
	deleteDeadCodes,
	deleteHashedCode,
	getHashedCode,
	type HashedCodeFilter
} from '$lib/server/db/actions/codes';
import { getUserByEmail, verifyUserEmail } from '$lib/server/db/actions/users';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

// Never reveal whether a code exists: unknown, expired, and orphaned codes
// all read as the same generic error (same copy as the email-code route).
const GENERIC_ERROR = 'Unexpected error, please try again';

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type PasswordVerifyDeps = {
	getHashedCode: typeof getHashedCode;
	deleteHashedCode: typeof deleteHashedCode;
	deleteDeadCodes: typeof deleteDeadCodes;
	getUserByEmail: typeof getUserByEmail;
	verifyUserEmail: typeof verifyUserEmail;
};

const defaultDeps: PasswordVerifyDeps = {
	getHashedCode,
	deleteHashedCode,
	deleteDeadCodes,
	getUserByEmail,
	verifyUserEmail
};

// Dedicated password-verify endpoint: the password user already exists, so
// unlike /signup/email/code (which mints a brand-new user via createNewUser
// and errors when the account exists) this looks the user up by the code
// row's email and flips emailVerified on them. #154/#162: only rows stamped
// `password-signup` redeem with a matching email.
export const POST = async (
	event: RequestEvent,
	deps: PasswordVerifyDeps = defaultDeps
): Promise<Response> => {
	const { request } = event;

	if (!rateLimit(clientKey(request, 'pw-verify-code'), 10, 15 * 60 * 1000)) {
		return json(
			{ success: false, error: 'Too many attempts. Try again shortly.' },
			{ status: 429 }
		);
	}

	const { code, email } = await request.json();

	if (!code || !email) {
		return json({ success: false, error: GENERIC_ERROR }, { status: 400 });
	}

	await deps.deleteDeadCodes();

	const filter: HashedCodeFilter = { code, email, type: 'password-signup' };
	const codeRow = await deps.getHashedCode(filter);
	if (!codeRow) {
		return json({ success: false, error: GENERIC_ERROR }, { status: 400 });
	}

	const user = await deps.getUserByEmail(codeRow.email);
	if (!user) {
		await deps.deleteHashedCode(filter);
		return json({ success: false, error: GENERIC_ERROR }, { status: 400 });
	}

	if (!user.emailVerified) {
		await deps.verifyUserEmail(user.id);
	}
	await deps.deleteHashedCode(filter);

	return json({ success: true });
};
