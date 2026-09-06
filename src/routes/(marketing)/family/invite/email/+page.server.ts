import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { parseJWT, validateJWT } from 'oslo/jwt';
import { EMAILSECRET } from '$env/static/private';
import { db } from '$lib/server/db';
import { users, familyMembers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getAccount } from '$lib/server/db/actions/accounts';
import { createNewUser } from '$lib/server/utils/createNewUser';
import { lucia } from '$lib/server/auth';
import { hashPassword } from '$lib/server/utils/password';

type InvitePayload = {
	email: string;
	firstName: string;
	lastName: string;
	familyId: string;
};

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
		typeof value.familyId === 'string'
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

async function setSessionCookie(
	event: { cookies: import('@sveltejs/kit').Cookies },
	userId: string
) {
	const session = await lucia.createSession(userId, {});
	const sessionCookie = lucia.createSessionCookie(session.id);
	event.cookies.set(sessionCookie.name, sessionCookie.value, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: import.meta.env.PROD
	});
}

async function createAccountAndJoin(
	event: import('./$types').RequestEvent,
	payload: { email: string; firstName: string; lastName: string; familyId: string },
	passwordHash?: string
) {
	const { email, firstName, lastName, familyId } = payload;
	const existingAccount = await getAccount(email);
	if (existingAccount) {
		await db.insert(familyMembers).values({
			userId: existingAccount.userId,
			familyId
		});
		await setSessionCookie(event, existingAccount.userId);
		throw redirect(303, '/family/' + familyId);
	}

	const user = await createNewUser(firstName, lastName, email);
	if (passwordHash) {
		await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
	}

	await db.insert(familyMembers).values({
		userId: user.id,
		familyId
	});

	await setSessionCookie(event, user.id);
	throw redirect(303, '/family/' + familyId);
}

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const action = formString(formData, '_action');
		const token = formString(formData, 'token');

		if (!token) {
			return fail(400, { error: 'Missing token' });
		}

		if (action === 'skip') {
			let payload: { email: string; firstName: string; lastName: string; familyId: string };
			try {
				payload = await validateToken(token);
			} catch {
				return fail(400, { error: 'Invalid or expired token' });
			}
			return await createAccountAndJoin(event, payload);
		}

		const password = formString(formData, 'password');
		const passwordConfirm = formString(formData, 'passwordConfirm');

		if (!password || password.length < 6) {
			return fail(400, { error: 'Password must be at least 6 characters' });
		}

		if (password !== passwordConfirm) {
			return fail(400, { error: 'Passwords do not match' });
		}

		let payload: { email: string; firstName: string; lastName: string; familyId: string };
		try {
			payload = await validateToken(token);
		} catch {
			return fail(400, { error: 'Invalid or expired token' });
		}

		const passwordHash = await hashPassword(password);

		return await createAccountAndJoin(event, payload, passwordHash);
	}
};
