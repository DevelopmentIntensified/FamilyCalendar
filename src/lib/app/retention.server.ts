/**
 * `runRetention(ctx)` — the weekly cleanup's one function. Every window lives
 * here (the schedule lives in `vercel.json`): the module prunes take the
 * cutoff and read no clock, and the response keys are the legacy cron's.
 *
 * | what                              | kept for |
 * |-----------------------------------|----------|
 * | Anonymous Accounts inactive       | 90 days  |
 * | read notifications                | 90 days  |
 * | resolved phrases and bug reports  | 180 days |
 * | ad events                         | 90 days  |
 * | expired claim tokens              | none     |
 *
 * The same weekly run also sweeps stale Recurring Task cursors to today-end
 * (tasks' bounded, idempotent `sweepOverdueTaskCursors`, Q-092). That is a
 * pin, not a prune, so it adds nothing to the response body: its counts are
 * logged.
 *
 * Runs sequentially, not `Promise.all`: the ctx db may be one transaction
 * session, and no prune gates another (a failed one still rejects the run —
 * the legacy route treated a thrown prune as a 500, while the per-person
 * guest delete is the one failure the identity prune swallows and logs).
 *
 * Doc: ./README.md#invariants
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { pruneExpiredClaimTokens } from '$lib/domains/access/index.server';
import { pruneReadAlertsOlderThan } from '$lib/domains/alerts/index.server';
import { pruneFeedbackOlderThan } from '$lib/domains/feedback/index.server';
import { pruneInactiveAnonymousAccounts } from '$lib/domains/identity/index.server';
import { pruneSponsoredEventsOlderThan } from '$lib/domains/sponsored/index.server';
import { sweepOverdueTaskCursors } from '$lib/domains/tasks/index.server';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Inactivity Window: unclaimed Anonymous Accounts go after 90 days. */
const ANONYMOUS_INACTIVITY_DAYS = 90;
/** #029 M5: read notifications go after 90 days. */
const NOTIFICATION_RETENTION_DAYS = 90;
/** #029 M5: resolved phrases and closed bug reports go after 180 days. */
const RESOLVED_RECORD_RETENTION_DAYS = 180;
/** #088: injected ad rows are read by nothing — keep them 90 days. */
const AD_EVENT_RETENTION_DAYS = 90;

/** The cleanup cron's body, key for key the legacy route's `runCleanup` result. */
export type RetentionReport = {
	readonly deleted: number;
	readonly scanned: number;
	/** The Anonymous Account cutoff, ISO — the only cutoff the legacy body sent. */
	readonly cutoff: string;
	readonly notificationsPruned: number;
	readonly phrasesPruned: number;
	readonly bugReportsPruned: number;
	readonly adEventsPruned: number;
};

function daysBefore(now: Date, days: number): Date {
	return new Date(now.getTime() - days * DAY_MS);
}

/**
 * Runs every retention prune with today's windows. "Now" is `ctx.clock.now()`,
 * read once, so one run uses one instant for every cutoff.
 */
export async function runRetention(ctx: Ctx): Promise<RetentionReport> {
	const now = ctx.clock.now();
	const cutoff = daysBefore(now, ANONYMOUS_INACTIVITY_DAYS);

	const guests = await pruneInactiveAnonymousAccounts(ctx, cutoff);
	await pruneExpiredClaimTokens(ctx, now);
	const notificationsPruned = await pruneReadAlertsOlderThan(
		ctx,
		daysBefore(now, NOTIFICATION_RETENTION_DAYS)
	);
	const feedback = await pruneFeedbackOlderThan(
		ctx,
		daysBefore(now, RESOLVED_RECORD_RETENTION_DAYS)
	);
	const adEventsPruned = await pruneSponsoredEventsOlderThan(
		ctx,
		daysBefore(now, AD_EVENT_RETENTION_DAYS)
	);
	const cursors = await sweepOverdueTaskCursors(ctx);
	ctx.log.info('tasks_cursor_sweep', { scanned: cursors.scanned, pinned: cursors.pinned });

	return {
		deleted: guests.deleted,
		scanned: guests.scanned,
		cutoff: cutoff.toISOString(),
		notificationsPruned,
		phrasesPruned: feedback.phrases,
		bugReportsPruned: feedback.bugs,
		adEventsPruned
	};
}
