import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteUser, getStaleAnonymousUsers } from '$lib/server/db/actions/users';
import { deleteExpiredClaimTokens } from '$lib/server/services/claimService';

// Inactivity Window: unclaimed Anonymous Accounts are deleted after
// 90 days without account action. Run weekly via external scheduler.
const INACTIVITY_WINDOW_DAYS = 90;

async function runCleanup() {
	const cutoff = new Date(Date.now() - INACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
	const staleUsers = await getStaleAnonymousUsers(cutoff);

	let deleted = 0;
	for (const user of staleUsers) {
		try {
			await deleteUser(user.id);
			deleted++;
		} catch (e) {
			console.error(`Failed to delete stale anonymous user ${user.id}:`, e);
		}
	}

	await deleteExpiredClaimTokens();

	return {
		deleted,
		scanned: staleUsers.length,
		cutoff: cutoff.toISOString()
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const secret = process.env.CRON_SECRET;
	if (!secret || request.headers.get('x-cron-secret') !== secret) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const result = await runCleanup();
	return json({ success: true, ...result });
};

export const POST = GET;
