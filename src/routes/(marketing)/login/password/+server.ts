import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserByEmail } from '$lib/server/db/actions/users';
import { verifyPassword } from '$lib/server/utils/password';
import { lucia, setSessionCookie } from '$lib/server/auth';
import { getUserSettings, createUserSettings } from '$lib/server/db/actions/userSettings';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

// Constant dummy bcrypt hash: compared against when the email is unknown so
// response timing matches the known-email path (user enumeration defense).
const DUMMY_BCRYPT_HASH = '$2a$10$C6UzMDM.H6dfI/f/IKcEeO7ZBpEbF1nZ.PnI1fT4/eqSYQ0xJ0fSO';

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	// Remember any anonymous session so its data can be merged after auth.
	const { stashGuestFromCookies } = await import('$lib/server/services/guestMergeService');
	await stashGuestFromCookies(cookies);

	try {
		const { email, password } = await request.json();

		if (!email || !password) {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}

		if (!rateLimit(clientKey(request, `pw-login:${email.toLowerCase()}`), 10, 5 * 60 * 1000)) {
			return json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
		}

		const user = await getUserByEmail(email);
		if (!user) {
			await verifyPassword(password, DUMMY_BCRYPT_HASH);
			return json({ error: 'Invalid email or password' }, { status: 401 });
		}

		if (!user.passwordHash) {
			return json({ error: 'Please use email login for this account' }, { status: 401 });
		}

		const validPassword = await verifyPassword(password, user.passwordHash);
		if (!validPassword) {
			return json({ error: 'Invalid email or password' }, { status: 401 });
		}

		// Settings follow the account: create the row on first login so the
		// timezone prompt prefills and server date math has a zone.
		const existingSettings = await getUserSettings(user.id);
		if (!existingSettings) {
			await createUserSettings({ userId: user.id, timeZone: 'UTC' });
		}

		const oldSessionId = locals.session?.id;
		const oldUser = locals.user;

		const session = await lucia.createSession(user.id, {});
		setSessionCookie(cookies, lucia.createSessionCookie(session.id));

		if (
			oldSessionId &&
			oldUser &&
			!oldUser.email &&
			oldUser.id !== user.id &&
			oldSessionId !== session.id
		) {
			await lucia.invalidateSession(oldSessionId).catch(() => {});
		}

		return json(
			{ success: true, user: { id: user.id, email: user.email, firstName: user.firstName } },
			{ status: 200 }
		);
	} catch (error) {
		console.error('Login error:', error);
		return json({ error: 'Failed to login' }, { status: 500 });
	}
};
