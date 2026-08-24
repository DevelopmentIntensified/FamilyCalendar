import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserByEmail, createUser, getUser } from '$lib/server/db/actions/users';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { createUserCalendar } from '$lib/server/db/actions/calendar';
import { hashPassword } from '$lib/server/utils/password';
import { lucia, setSessionCookie } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
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

		const existingUser = await getUserByEmail(email);
		if (existingUser) {
			return json({ error: 'An account with this email already exists' }, { status: 400 });
		}

		const passwordHash = await hashPassword(password);

		const user = await createUser({
			email,
			passwordHash,
			firstName,
			lastName,
			emailVerified: true,
			roles: []
		});

		await createUserCalendar(user.id);

		const session = await lucia.createSession(user.id, {});
		setSessionCookie(cookies, lucia.createSessionCookie(session.id));

		return json(
			{ success: true, user: { id: user.id, email: user.email, firstName: user.firstName } },
			{ status: 201 }
		);
	} catch (error) {
		console.error('Signup error:', error);
		return json({ error: 'Failed to create account' }, { status: 500 });
	}
};
