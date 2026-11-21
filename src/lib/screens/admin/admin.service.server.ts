/**
 * admin services: the one badge-count read behind both the `(admin)` layout
 * data and `/api/admin`.
 *
 * Legacy `loadAdminCounts` (`src/lib/server/services/adminData.ts:33-40`) ran
 * one `guard('admin-counts', 0, …)` per register, so a single broken count
 * degraded to 0 instead of 500ing every admin page and the JSON call. This is
 * the same composition with the kernel's log instead of `console.error`: each
 * leg reads 0 and logs `admin_count_failed`; nothing is filed as a bug report,
 * because a degraded badge is not a fault.
 *
 * No SQL and no rules here: the counts are `feedback`'s reads, reached through
 * its public server interface (rule R2). This screen owns no tables.
 *
 * Doc: ./README.md#public-interface
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { openBugReportCount, openUnmatchedPhraseCount } from '$lib/domains/feedback/index.server';
import type { AdminCounts } from './admin.contract';

/** Which badge a degraded leg belongs to; the log's `leg` field. */
type AdminCountLeg = keyof AdminCounts;

/**
 * One badge leg: its count, or 0 (plus one `admin_count_failed` warning) when
 * the read throws. Never rethrows — the badges are chrome, the shell is not.
 */
async function degradeToZero(
	ctx: Ctx,
	leg: AdminCountLeg,
	read: () => Promise<number>
): Promise<number> {
	try {
		return await read();
	} catch (error) {
		ctx.log.warn('admin_count_failed', {
			leg,
			message: error instanceof Error ? error.message : String(error)
		});
		return 0;
	}
}

/**
 * The admin nav's two open badge counts: bug reports without a `resolvedAt`
 * and unmatched phrases with `resolved = false`.
 *
 * The legs run one after the other, not in `Promise.all`: `ctx.db` may be one
 * transaction session (the same constraint feedback's `countOpenFeedback`
 * documents), and a failed leg must leave the other's real count standing.
 */
export async function getAdminCounts(ctx: Ctx): Promise<AdminCounts> {
	const openBugs = await degradeToZero(ctx, 'openBugs', () => openBugReportCount(ctx));
	const openPhrases = await degradeToZero(ctx, 'openPhrases', () =>
		openUnmatchedPhraseCount(ctx)
	);
	return { openBugs, openPhrases };
}
