import { db } from '$lib/server/db';
import { adEvents } from '$lib/server/db/schema';
import { count, gte, lt } from 'drizzle-orm';

/**
 * #088 — retention and reporting for adEvents.
 *
 * The ad-injection path writes one row per injected ad (`injectAdEvent` in the
 * ad service) and nothing in the app reads the table back. Two answers to
 * that: a weekly-cron prune so the write-only table cannot grow unbounded, and
 * one minimal reporting read for analytics.
 */

/**
 * #088 weekly-cron retention: injected ad rows older than the cutoff are
 * deleted. Anchored on createdAt — adEvents has no resolved/closed state;
 * age alone is the rule. Returns rows removed.
 */
export async function pruneAdEventsOlderThan(cutoff: Date): Promise<number> {
	const deleted = await db
		.delete(adEvents)
		.where(lt(adEvents.createdAt, cutoff))
		.returning({ id: adEvents.id });
	return deleted.length;
}

/**
 * Count of injected ad rows created inside the window, grouped by target plan
 * as kind — the closest discriminator the table carries. No UI consumer yet;
 * exported for reporting/analytics tooling.
 */
export async function countRecentAdEventsByTargetPlan(cutoff: Date) {
	return await db
		.select({ kind: adEvents.targetPlan, count: count() })
		.from(adEvents)
		.where(gte(adEvents.createdAt, cutoff))
		.groupBy(adEvents.targetPlan);
}
