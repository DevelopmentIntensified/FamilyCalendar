import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteUser, getStaleAnonymousUsers } from '$lib/server/db/actions/users';
import { deleteExpiredClaimTokens } from '$lib/server/services/claimService';
import { pruneReadNotificationsOlderThan } from '$lib/server/db/actions/notifications';
import { pruneResolvedUnmatchedPhrases } from '$lib/server/db/actions/unmatchedPhrases';
import { pruneResolvedBugReports } from '$lib/server/db/actions/bugReports';

// Inactivity Window: unclaimed Anonymous Accounts are deleted after
// 90 days without account action. Run weekly via external scheduler.
const INACTIVITY_WINDOW_DAYS = 90;
// #029 M5 retention windows: read notifications 90d; resolved unmatched
// phrases and closed bug reports 180d.
const NOTIFICATION_RETENTION_DAYS = 90;
const RESOLVED_RECORD_RETENTION_DAYS = 180;

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

	// Independent retention prunes — none of them gate the others.
	const resolvedCutoff = new Date(
		Date.now() - RESOLVED_RECORD_RETENTION_DAYS * 24 * 60 * 60 * 1000
	);
	const [notificationsPruned, phrasesPruned, bugReportsPruned] = await Promise.all([
		pruneReadNotificationsOlderThan(
			new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
		),
		pruneResolvedUnmatchedPhrases(resolvedCutoff),
		pruneResolvedBugReports(resolvedCutoff)
	]);

	return {
		deleted,
		scanned: staleUsers.length,
		cutoff: cutoff.toISOString(),
		notificationsPruned,
		phrasesPruned,
		bugReportsPruned
	};
}

function isAuthorized(request: Request): boolean {
	const secret = process.env.CRON_SECRET;
	if (!secret) return false;
	// Vercel Cron sends: Authorization: Bearer ${CRON_SECRET}
	const authHeader = request.headers.get('authorization');
	if (authHeader === `Bearer ${secret}`) return true;
	// Manual/external schedulers can use a plain header.
	return request.headers.get('x-cron-secret') === secret;
}

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorized(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const result = await runCleanup();
	return json({ success: true, ...result });
};

export const POST = GET;
