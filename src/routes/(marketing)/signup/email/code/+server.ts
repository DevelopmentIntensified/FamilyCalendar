import type { RequestHandler } from './$types';
import { session as sessionModule } from '$lib/server/auth';
import {
	deleteDeadCodes,
	deleteHashedCode,
	getHashedCode,
	type HashedCodeFilter
} from '$lib/server/db/actions/codes';
import { getAccount } from '$lib/server/db/actions/accounts';
import { createNewUser } from '$lib/server/utils/createNewUser';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type SignupCodeDeps = {
	getHashedCode: typeof getHashedCode;
	deleteHashedCode: typeof deleteHashedCode;
	deleteDeadCodes: typeof deleteDeadCodes;
	getAccount: typeof getAccount;
	createNewUser: typeof createNewUser;
	session: Pick<typeof sessionModule, 'createSession' | 'createSessionCookie'>;
};

const defaultDeps: SignupCodeDeps = {
	getHashedCode,
	deleteHashedCode,
	deleteDeadCodes,
	getAccount,
	createNewUser,
	session: sessionModule
};

// #154/#162: wrong code, wrong email, and mismatched type all read identically.
const GENERIC_ERROR = 'Unexpected error, please try again';

export const POST: RequestHandler = async function (event, deps = defaultDeps) {
	const {
		getHashedCode: lookupCode,
		deleteHashedCode,
		deleteDeadCodes,
		getAccount: lookupAccount,
		createNewUser,
		session
	} = deps;

	if (!rateLimit(clientKey(event.request, 'verify-signup-code'), 10, 15 * 60 * 1000)) {
		return new Response(
			JSON.stringify({ success: false, error: 'Too many attempts. Try again shortly.' }),
			{ status: 429 }
		);
	}

	// Remember any anonymous session so its data can be merged after auth.
	const { stashGuestFromCookies } = await import('$lib/server/services/guestMergeService');
	await stashGuestFromCookies(event.cookies);

	const { code, email } = await event.request.json();

	if (!code || !email) {
		return new Response(JSON.stringify({ success: false, error: GENERIC_ERROR }), {
			status: 400
		});
	}

	await deleteDeadCodes();

	// #154: only signup-stamped rows redeem; #162: lookup hashes + binds the
	// email so a digest match alone is not sufficient.
	const filter: HashedCodeFilter = { code, email, type: 'signup' };
	const codeToCheck = await lookupCode(filter);
	if (!codeToCheck) {
		return new Response(JSON.stringify({ success: false, error: GENERIC_ERROR }), {
			status: 400
		});
	}

	try {
		const { firstName, lastName } = codeToCheck;
		if (!codeToCheck.email || !lastName || !firstName) {
			return new Response(JSON.stringify({ success: false, error: GENERIC_ERROR }), {
				status: 500
			});
		}

		const userAccount = await lookupAccount(email);
		if (userAccount) {
			await deleteHashedCode(filter);
			return new Response(
				JSON.stringify({ success: false, error: 'Account with this email already Exists' }),
				{ status: 500 }
			);
		}

		const user = await createNewUser(firstName, lastName, email);

		const newSession = await session.createSession(user.id);
		const sessionCookie = await session.createSessionCookie(newSession);

		const headers = new Headers();
		headers.append('Set-Cookie', sessionCookie.serialize());

		const result = new Response(null, {
			status: 200,
			headers
		});

		await deleteHashedCode(filter);

		return result;
	} catch {
		return new Response(JSON.stringify({ success: false, error: GENERIC_ERROR }), {
			status: 500
		});
	}
};
