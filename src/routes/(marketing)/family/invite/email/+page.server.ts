import type { PageServerLoad, Actions } from './$types';
import type { Cookies } from '@sveltejs/kit';
import { fail, redirect } from '@sveltejs/kit';
import { parseJWT, validateJWT } from 'oslo/jwt';
import { EMAILSECRET } from '$env/static/private';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getAccount } from '$lib/server/db/actions/accounts';
import { acceptInvite, verifyInviteCode } from '$lib/server/db/actions/families';
import { createNewUser } from '$lib/server/utils/createNewUser';
import { createSession, createSessionCookie, setSessionCookie } from '$lib/server/auth';
import { hashPassword } from '$lib/server/utils/password';

type InvitePayload = {
	email: string;
	firstName: string;
	lastName: string;
	familyId: string;
	inviteCode?: string;
};

const JOIN_UNAVAILABLE = 'This invite link is no longer valid or has already been used.';
const JOIN_COMPLETE = 'Family joined. Sign in to continue.';

function loginWithNotice(message: string): never {
	throw redirect(303, '/login?error=' + encodeURIComponent(message));
}

function isInvitePayload(value: unknown): value is InvitePayload {
	return (
		typeof value === 'object' &&
		value !== null &&
		'email' in value &&
		typeof value.email === 'string' &&
		'firstName' in value &&
		typeof value.firstName === 'string' &&
		'lastName' in value &&
		typeof value.lastName === 'string' &&
		'familyId' in value &&
		typeof value.familyId === 'string' &&
		(!('inviteCode' in value) || typeof value.inviteCode === 'string')
	);
}

function isString(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string';
}

function formString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return isString(value) ? value : '';
}

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token');
	if (!token) {
		throw redirect(302, '/login?error=missing_token');
	}

	const secret = new TextEncoder().encode(EMAILSECRET);
	try {
		await validateJWT('HS256', secret, token);
	} catch {
		throw redirect(302, '/login?error=invalid_token');
	}

	const parsed = parseJWT(token);
	if (!parsed?.payload) {
		throw redirect(302, '/login?error=invalid_token');
	}

	const payload: unknown = parsed.payload;
	if (!isInvitePayload(payload)) {
		throw redirect(302, '/login?error=invalid_token');
	}
	if (!payload.email || !payload.firstName || !payload.lastName || !payload.familyId) {
		throw redirect(302, '/login?error=invalid_token');
	}

	return {
		token,
		email: payload.email,
		firstName: payload.firstName,
		lastName: payload.lastName,
		familyId: payload.familyId
	};
};

async function validateToken(token: string) {
	const secret = new TextEncoder().encode(EMAILSECRET);
	await validateJWT('HS256', secret, token);
	const parsed = parseJWT(token);
	if (!parsed?.payload) throw new Error('Invalid token');
	const payload: unknown = parsed.payload;
	if (!isInvitePayload(payload)) throw new Error('Invalid token');
	if (!payload.email || !payload.firstName || !payload.lastName || !payload.familyId)
		throw new Error('Invalid token');
	return payload;
}

/** Session-cookie producer for this route: delegates to the auth module. */
async function startSessionFor(event: { cookies: Cookies }, userId: string) {
	const newSession = await createSession(userId);
	setSessionCookie(event.cookies, await createSessionCookie(newSession));
}

/**
 * Collaborators the accept action needs, injectable for tests. Defaults wire
 * the production modules.
 */
export type InviteEmailAcceptDeps = {
	getAccount: typeof getAccount;
	createNewUser: typeof createNewUser;
	acceptInvite: typeof acceptInvite;
	verifyInviteCode: typeof verifyInviteCode;
	setPasswordHash: (userId: string, passwordHash: string) => Promise<void>;
	startSession: (event: { cookies: Cookies }, userId: string) => Promise<void>;
	hashPassword: typeof hashPassword;
};

const defaultDeps: InviteEmailAcceptDeps = {
	getAccount,
	createNewUser,
	acceptInvite,
	verifyInviteCode,
	setPasswordHash: (userId, passwordHash) =>
		db.update(users).set({ passwordHash }).where(eq(users.id, userId)),
	startSession: (event, userId) => startSessionFor(event, userId),
	hashPassword
};

/**
 * Join through the durable single-use invite row the JWT embeds (issue 152):
 * maxUses, expiry, revocation (row delete) and the family-size cap are all
 * enforced by acceptInvite, so a replayed or forwarded JWT link cannot mint
 * memberships. An EXISTING account is joined but never signed in from a
 * bearer invite link — sign in normally to see the family.
 */
async function createAccountAndJoin(
	event: { cookies: Cookies },
	payload: {
		email: string;
		firstName: string;
		lastName: string;
		familyId: string;
		inviteCode?: string;
	},
	deps: InviteEmailAcceptDeps,
	passwordHash?: string
) {
	if (!payload.inviteCode) {
		loginWithNotice(JOIN_UNAVAILABLE);
	}

	const existingAccount = await deps.getAccount(payload.email);
	if (existingAccount) {
		const joined = await deps.acceptInvite(existingAccount.userId, payload.inviteCode);
		if (!joined.accepted) {
			loginWithNotice(JOIN_UNAVAILABLE);
		}
		loginWithNotice(JOIN_COMPLETE);
	}

	const verified = await deps.verifyInviteCode(payload.inviteCode);
	if (!verified) {
		loginWithNotice(JOIN_UNAVAILABLE);
	}

	const user = await deps.createNewUser(payload.firstName, payload.lastName, payload.email);
	if (passwordHash) {
		await deps.setPasswordHash(user.id, passwordHash);
	}

	const joined = await deps.acceptInvite(user.id, payload.inviteCode);
	if (!joined.accepted) {
		loginWithNotice(JOIN_UNAVAILABLE);
	}

	await deps.startSession(event, user.id);
	throw redirect(303, '/family/' + verified.family.id);
}

export const actions: Actions = {
	default: async (event, deps: InviteEmailAcceptDeps = defaultDeps) => {
		const formData = await event.request.formData();
		const action = formString(formData, '_action');
		const token = formString(formData, 'token');

		if (!token) {
			return fail(400, { error: 'Missing token' });
		}

		if (action === 'skip') {
			let payload: { email: string; firstName: string; lastName: string; familyId: string; inviteCode?: string };
			try {
				payload = await validateToken(token);
			} catch {
				return fail(400, { error: 'Invalid or expired token' });
			}
			return await createAccountAndJoin(event, payload, deps);
		}

		const password = formString(formData, 'password');
		const passwordConfirm = formString(formData, 'passwordConfirm');

		if (!password || password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters' });
		}

		if (password !== passwordConfirm) {
			return fail(400, { error: 'Passwords do not match' });
		}

		let payload: { email: string; firstName: string; lastName: string; familyId: string; inviteCode?: string };
		try {
			payload = await validateToken(token);
		} catch {
			return fail(400, { error: 'Invalid or expired token' });
		}

		const passwordHash = await deps.hashPassword(password);

		return await createAccountAndJoin(event, payload, deps, passwordHash);
	}
};
