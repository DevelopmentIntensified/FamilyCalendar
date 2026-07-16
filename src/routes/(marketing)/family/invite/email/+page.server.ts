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
import { hash } from '@node-rs/argon2';
import { getUrl } from '$lib/utils/getUrl';

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

	const payload = parsed.payload as { email: string; firstName: string; lastName: string; familyId: string };
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
	const payload = parsed.payload as { email: string; firstName: string; lastName: string; familyId: string };
	if (!payload.email || !payload.firstName || !payload.lastName || !payload.familyId) throw new Error('Invalid token');
	return payload;
}

async function createAccountAndJoin(payload: { email: string; firstName: string; lastName: string; familyId: string }, passwordHash?: string) {
	const { email, firstName, lastName, familyId } = payload;
	const existingAccount = await getAccount(email);
	if (existingAccount) {
		await db.insert(familyMembers).values({
			userId: existingAccount.userId,
			familyId
		});
		const session = await lucia.createSession(existingAccount.userId, {});
		const sessionCookie = lucia.createSessionCookie(session.id);
		return new Response(null, {
			status: 302,
			headers: {
				Location: getUrl() + '/family/' + familyId,
				'Set-Cookie': sessionCookie.serialize()
			}
		});
	}

	const user = await createNewUser(firstName, lastName, email);
	if (passwordHash) {
		await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
	}

	await db.insert(familyMembers).values({
		userId: user.id,
		familyId
	});

	const session = await lucia.createSession(user.id, {});
	const sessionCookie = lucia.createSessionCookie(session.id);

	return new Response(null, {
		status: 302,
		headers: {
			Location: getUrl() + '/family/' + familyId,
			'Set-Cookie': sessionCookie.serialize()
		}
	});
}

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const password = formData.get('password') as string;
		const passwordConfirm = formData.get('passwordConfirm') as string;
		const token = formData.get('token') as string;

		if (!token) {
			return fail(400, { error: 'Missing token' });
		}

		if (!password || password.length < 6) {
			return fail(400, { error: 'Password must be at least 6 characters' });
		}

		if (password !== passwordConfirm) {
			return fail(400, { error: 'Passwords do not match' });
		}

		try {
			const payload = await validateToken(token);
			const passwordHash = await hash(password, {
				memoryCost: 19456,
				timeCost: 2,
				outputLen: 32,
				parallelism: 1
			});
			return await createAccountAndJoin(payload, passwordHash);
		} catch {
			return fail(400, { error: 'Invalid or expired token' });
		}
	},
	skip: async (event) => {
		const formData = await event.request.formData();
		const token = formData.get('token') as string;

		if (!token) {
			return fail(400, { error: 'Missing token' });
		}

		try {
			const payload = await validateToken(token);
			return await createAccountAndJoin(payload);
		} catch {
			return fail(400, { error: 'Invalid or expired token' });
		}
	}
};
