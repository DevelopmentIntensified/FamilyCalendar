import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserByEmail } from '$lib/server/db/actions/users';
import { verifyPassword } from '$lib/server/utils/password';
import { lucia } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const { email, password } = await request.json();

		if (!email || !password) {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}

		const user = await getUserByEmail(email);
		if (!user) {
			return json({ error: 'Invalid email or password' }, { status: 401 });
		}

		if (!user.passwordHash) {
			return json({ error: 'Please use email login for this account' }, { status: 401 });
		}

		const validPassword = await verifyPassword(password, user.passwordHash);
		if (!validPassword) {
			return json({ error: 'Invalid email or password' }, { status: 401 });
		}

		const session = await lucia.createSession(user.id, {});
		const sessionCookie = lucia.createSessionCookie(session.id);

		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '/',
			...sessionCookie.attributes
		});

		return json(
			{ success: true, user: { id: user.id, email: user.email, firstName: user.firstName } },
			{ status: 200 }
		);
	} catch (error) {
		console.error('Login error:', error);
		return json({ error: 'Failed to login' }, { status: 500 });
	}
};
