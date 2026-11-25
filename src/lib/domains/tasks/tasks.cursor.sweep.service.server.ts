/**
 * tasks cursor sweep: the scheduled half of the overdue pin (Q-092). Reads no
 * longer pin stale Recurring Task cursors, and a cursor-moving write only
 * pins its own actor's scope, so this sweep pins every OTHER owner's stale
 * cursors once per run (the `app` cleanup cron calls it).
 *
 * A stale cursor is a due date strictly before today's start in its OWNER's
 * stored zone (UTC with none); it moves to 23:59 that day, exactly the pin
 * the write path runs (`tasks.cursor.rules.ts`). The run is
 *
 * - bounded: at most `SWEEP_MAX_BATCHES` keyset pages of `SWEEP_BATCH_SIZE`
 *   candidates (due before now, any owner), so one run never holds an
 *   unbounded read or UPDATE; whatever is left waits for the next run or its
 *   owner's next write;
 * - idempotent: a pinned row's due date is today-end, so a second run
 *   selects it as a candidate at most and moves nothing.
 *
 * Time is `ctx.clock`; zones come from identity's public read (rule R3).
 *
 * Doc: ./README.md#invariants
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { getTimeZone } from '$lib/domains/identity/index.server';
import { needsOverduePin, pinnedDueFor } from './tasks.cursor.rules';
import { listOverdueRecurringTasks, pinDueDates } from './tasks.repo.server';

/** Candidates read (and at most pinned) per page. */
export const TASKS_SWEEP_BATCH_SIZE = 200;
/** Pages per run: 25 × 200 = 5,000 candidate rows. */
export const TASKS_SWEEP_MAX_BATCHES = 25;

/** What one sweep run did: candidates looked at, and rows moved to today-end. */
export type TaskCursorSweepReport = { readonly scanned: number; readonly pinned: number };

/** The sweep's two bounds; the defaults are the production ones. */
export type TaskCursorSweepLimits = {
	readonly batchSize?: number;
	readonly maxBatches?: number;
};

/**
 * Pin every stale open Recurring Task cursor, a bounded page at a time. "Now"
 * is `ctx.clock.now()`, read once, so one run uses one instant for every row.
 */
export async function sweepOverdueTaskCursors(
	ctx: Ctx,
	limits: TaskCursorSweepLimits = {}
): Promise<TaskCursorSweepReport> {
	const batchSize = limits.batchSize ?? TASKS_SWEEP_BATCH_SIZE;
	const maxBatches = limits.maxBatches ?? TASKS_SWEEP_MAX_BATCHES;
	const now = ctx.clock.now();
	const beforeIso = now.toISOString();
	const zones = new Map<string, string>();
	let scanned = 0;
	let pinned = 0;
	let afterId: string | null = null;

	for (let batch = 0; batch < maxBatches; batch += 1) {
		const rows = await listOverdueRecurringTasks(ctx.db, { beforeIso, afterId, limit: batchSize });
		if (rows.length === 0) break;
		scanned += rows.length;
		afterId = rows[rows.length - 1].id;

		// One UPDATE per distinct target instant (one per zone in play).
		const byTarget = new Map<string, string[]>();
		for (const row of rows) {
			let zone = zones.get(row.userId);
			if (zone === undefined) {
				zone = (await getTimeZone(ctx, row.userId)) ?? 'UTC';
				zones.set(row.userId, zone);
			}
			if (!needsOverduePin(row.dueDate, now, zone)) continue;
			const target = pinnedDueFor(now, zone);
			const ids = byTarget.get(target);
			if (ids) ids.push(row.id);
			else byTarget.set(target, [row.id]);
		}
		for (const [dueDate, taskIds] of byTarget) {
			pinned += await pinDueDates(ctx.db, { taskIds, dueDate });
		}
		if (rows.length < batchSize) break;
	}
	return { scanned, pinned };
}
