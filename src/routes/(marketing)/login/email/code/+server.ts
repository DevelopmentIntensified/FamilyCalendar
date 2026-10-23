import type { RequestEvent } from './$types';
import { invalidateStaleAnonymousSession, session as sessionModule } from '$lib/server/auth';
import {
	deleteDeadCodes,
	deleteHashedCode,
	getHashedCode,
	type HashedCodeFilter
} from '$lib/server/db/actions/codes';
import { getAccount } from '$lib/server/db/actions/accounts';
import { getUserByEmail } from '$lib/server/db/actions/users';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type LoginCodeDeps = {
	getHashedCode: typeof getHashedCode;
	deleteHashedCode: typeof deleteHashedCode;
	deleteDeadCodes: typeof deleteDeadCodes;
	getAccount: typeof getAccount;
	getUserByEmail: typeof getUserByEmail;
	session: Pick<
		typeof sessionModule,
		'createSession' | 'createSessionCookie' | 'invalidateSession'
	>;
};

const defaultDeps: LoginCodeDeps = {
	getHashedCode,
	deleteHashedCode,
	deleteDeadCodes,
	getAccount,
	getUserByEmail,
	session: sessionModule
};

// #154/#162: wrong code, wrong email, and mismatched type all read identically.
const GENERIC_ERROR = 'Unexpected error, please try again';

export const POST = async function (
	event: RequestEvent,
	deps: LoginCodeDeps = defaultDeps
): Promise<Response> {
	const {
		getHashedCode: lookupCode,
		deleteHashedCode,
		deleteDeadCodes,
		getAccount: lookupAccount,
		getUserByEmail: lookupUser,
		session
	} = deps;

	if (!rateLimit(clientKey(event.request, 'verify-login-code'), 10, 15 * 60 * 1000)) {
		return new Response(
			JSON.stringify({ success: false, error: 'Too many attempts. Try again shortly.' }),
			{ status: 429 }
		);
	}

	const { code, email } = await event.request.json();

	if (!code || !email) {
		return new Response(JSON.stringify({ success: false, error: GENERIC_ERROR }), {
			status: 400
		});
	}

	// Remember any anonymous session so its data can be merged after auth.
	const { stashGuestFromCookies } = await import('$lib/server/services/guestMergeService');
	await stashGuestFromCookies(event.cookies);

	await deleteDeadCodes();

	// #154: only login-stamped rows redeem; #162: lookup hashes + binds the
	// email so a digest match alone is not sufficient.
	const filter: HashedCodeFilter = { code, email, type: 'login' };
	const codeToCheck = await lookupCode(filter);
	if (!codeToCheck) {
		return new Response(JSON.stringify({ success: false, error: GENERIC_ERROR }), {
			status: 400
		});
	}

	try {
		const rowEmail = codeToCheck.email;
		if (!rowEmail) {
			return new Response(JSON.stringify({ success: false, error: GENERIC_ERROR }), {
				status: 500
			});
		}

		let userAccount: { userId: string } | null = await lookupAccount(rowEmail);
		if (!userAccount) {
			const user = await lookupUser(rowEmail);
			if (!user) {
				return new Response(JSON.stringify({ success: false, error: 'No Account found' }), {
					status: 500
				});
			}
			userAccount = { userId: user.id };
		}

		const oldSessionId = event.locals?.session?.id;
		const oldUser = event.locals?.user;

		const sessionRecord = await session.createSession(userAccount.userId);
		const sessionCookie = await session.createSessionCookie(sessionRecord);

		await invalidateStaleAnonymousSession(oldUser, oldSessionId, userAccount.userId, sessionRecord.id);

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
