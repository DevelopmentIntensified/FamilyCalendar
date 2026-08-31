import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { consumeClaimToken, peekClaimToken } from '$lib/server/services/claimService';
import { claimEmailForUser, getUserByEmail } from '$lib/server/db/actions/users';
import { getUserSettings, createUserSettings } from '$lib/server/db/actions/userSettings';
import { lucia, setSessionCookie } from '$lib/server/auth';
import { mergeGuestIntoUser } from '$lib/server/services/guestMergeService';

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) {
		throw redirect(302, '/login');
	}

	const token = event.params.token || '';

	// Peek without consuming so previewing the link in another browser
	// (failing the ownership check) doesn't burn the token.
	const claimed = await peekClaimToken(token);

	if (!claimed) {
		throw redirect(302, '/claim?error=invalid');
	}

	if (claimed.userId !== event.locals.user.id) {
		// Token was issued to a different anonymous session.
		throw redirect(302, '/claim?error=invalid');
	}

	// All checks passed — now atomically consume exactly once.
	if (!(await consumeClaimToken(token))) {
		throw redirect(302, '/claim?error=invalid');
	}

	// If the email already belongs to another registered account, and this guest
	// proved ownership by clicking the link in that email's inbox, automatically
	// merge the guest's data into that account and sign in as it.
	const existingUser = await getUserByEmail(claimed.email);
	if (existingUser && existingUser.id !== claimed.userId) {
		await mergeGuestIntoUser(claimed.userId, existingUser.id);

		// The guest session was just deleted by the merge — sign the user into
		// the existing account they merged into.
		const session = await lucia.createSession(existingUser.id, {});
		setSessionCookie(event.cookies, lucia.createSessionCookie(session.id));

		throw redirect(302, '/calendar?claimed=1');
	}

	await claimEmailForUser(claimed.userId, claimed.email);

	// Claiming promotes the guest to a real account — make sure settings
	// (and the timezone) carried over from guest mode still exist.
	const existingSettings = await getUserSettings(claimed.userId);
	if (!existingSettings) {
		await createUserSettings({ userId: claimed.userId, timeZone: 'UTC' });
	}

	throw redirect(302, '/calendar?claimed=1');
};
