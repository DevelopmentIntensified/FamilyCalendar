import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { consumeClaimToken } from '$lib/server/services/claimService';
import { claimEmailForUser, getUserByEmail } from '$lib/server/db/actions/users';
import { getUserSettings, createUserSettings } from '$lib/server/db/actions/userSettings';

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) {
		throw redirect(302, '/login');
	}

	const token = event.params.token || '';
	const claimed = await consumeClaimToken(token);

	if (!claimed) {
		throw redirect(302, '/claim?error=invalid');
	}

	if (claimed.userId !== event.locals.user.id) {
		// Token was issued to a different anonymous session.
		throw redirect(302, '/claim?error=invalid');
	}

	// Re-check Claim Conflict at click time: the email may have been
	// registered between requesting the link and clicking it.
	const existingUser = await getUserByEmail(claimed.email);
	if (existingUser && existingUser.id !== claimed.userId) {
		throw redirect(302, `/claim?conflict=1&email=${encodeURIComponent(claimed.email)}`);
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
