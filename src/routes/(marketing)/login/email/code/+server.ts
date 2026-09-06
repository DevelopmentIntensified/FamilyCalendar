import type { RequestEvent } from './$types';
import { lucia } from '$lib/server/auth';
import { deleteCode, deleteDeadCodes, getCode } from '$lib/server/db/actions/codes';
import { getAccount } from '$lib/server/db/actions/accounts';
import { getUserByEmail } from '$lib/server/db/actions/users';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type LoginCodeDeps = {
	getCode: typeof getCode;
	deleteCode: typeof deleteCode;
	deleteDeadCodes: typeof deleteDeadCodes;
	getAccount: typeof getAccount;
	getUserByEmail: typeof getUserByEmail;
	lucia: Pick<typeof lucia, 'createSession' | 'createSessionCookie' | 'invalidateSession'>;
};

const defaultDeps: LoginCodeDeps = {
	getCode,
	deleteCode,
	deleteDeadCodes,
	getAccount,
	getUserByEmail,
	lucia
};

export const POST = async function (
	event: RequestEvent,
	deps: LoginCodeDeps = defaultDeps
): Promise<Response> {
	const {
		getCode: lookupCode,
		deleteCode: removeCode,
		deleteDeadCodes,
		getAccount: lookupAccount,
		getUserByEmail: lookupUser,
		lucia: session
	} = deps;

	if (!rateLimit(clientKey(event.request, 'verify-login-code'), 10, 15 * 60 * 1000)) {
		return new Response(
			JSON.stringify({ success: false, error: 'Too many attempts. Try again shortly.' }),
			{ status: 429 }
		);
	}

	const code = (await event.request.json()).code;

	// Remember any anonymous session so its data can be merged after auth.
	const { stashGuestFromCookies } = await import('$lib/server/services/guestMergeService');
	await stashGuestFromCookies(event.cookies);

	await deleteDeadCodes();

	const codeToCheck = await lookupCode(code);
	if (!codeToCheck) {
		return new Response(
			JSON.stringify({ success: false, error: 'Unexpected error, please try again' }),
			{ status: 500 }
		);
	}

	try {
		const email = codeToCheck.email;
		if (!email) {
			return new Response(
				JSON.stringify({ success: false, error: 'Unexpected error, please try again' }),
				{ status: 500 }
			);
		}

		let userAccount: { userId: string } | null = await lookupAccount(email);
		if (!userAccount) {
			const user = await lookupUser(email);
			if (!user) {
				return new Response(JSON.stringify({ success: false, error: 'No Account found' }), {
					status: 500
				});
			}
			userAccount = { userId: user.id };
		}

		const oldSessionId = event.locals?.session?.id;
		const oldUser = event.locals?.user;

		const sessionRecord = await session.createSession(userAccount.userId, {});
		const sessionCookie = session.createSessionCookie(sessionRecord.id);

		if (
			oldSessionId &&
			oldUser &&
			!oldUser.email &&
			oldUser.id !== userAccount.userId &&
			oldSessionId !== sessionRecord.id
		) {
			await session.invalidateSession(oldSessionId).catch(() => {});
		}

		const headers = new Headers();
		headers.append('Set-Cookie', sessionCookie.serialize());

		const result = new Response(null, {
			status: 200,
			headers
		});

		await removeCode(code);

		return result;
	} catch {
		return new Response(
			JSON.stringify({ success: false, error: 'Unexpected error, please try again' }),
			{ status: 500 }
		);
	}
};
