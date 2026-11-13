/**
 * billing repo: every query over `discounts`, `userDiscounts`,
 * `activeSubscriptions`, `subscriptionTypes` and `aiUsageTracking`.
 *
 * Each function takes `db: Db` first, contains no policy (the limit merge and
 * every refusal live in the rules) and touches only this module's tables — no
 * joins, no foreign reads. The active-row filter is this module's one read
 * seam: tied to a tier and unexpired, newest `createdAt` first.
 *
 * Writes take the caller's `now` and stamp `createdAt`/`updatedAt` themselves
 * (rule R5); nothing here reads the process clock.
 *
 * Doc: ./README.md#invariants
 */
import { and, desc, eq, gt, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import {
	aiUsageTracking,
	type AiUsageTrackingRow,
	discounts,
	type DiscountRow,
	type NewDiscountRow,
	type NewSubscriptionTypeRow,
	subscriptions,
	type SubscriptionRow,
	subscriptionTypes,
	type SubscriptionTypeRow,
	type UserDiscountRow,
	userDiscounts
} from '$lib/kernel/db/tables.server';
import type { AiUsagePeriod } from './billing.contract';

/**
 * The person's active subscription row: tied to a tier and not expired.
 * `endDate` is `NOT NULL`, so the legacy `endDate IS NULL` branch could never
 * match and is not carried over (S1 note); an end date exactly at `now` is
 * already expired (the legacy strict `>`). Null when nothing matches.
 */
export async function findActiveSubscription(
	db: Db,
	userId: string,
	now: Date
): Promise<SubscriptionRow | null> {
	const [row] = await db
		.select()
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.userId, userId),
				isNotNull(subscriptions.subscriptionTypeId),
				gt(subscriptions.endDate, now)
			)
		)
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	return row ?? null;
}

/** One tier by id (the active row's `subscriptionTypeId`). */
export async function findTier(db: Db, tierId: string): Promise<SubscriptionTypeRow | null> {
	const [row] = await db
		.select()
		.from(subscriptionTypes)
		.where(eq(subscriptionTypes.id, tierId))
		.limit(1);
	return row ?? null;
}

/** The plans a person may buy: disabled tiers never reach a page. */
export async function listEnabledTiers(db: Db): Promise<SubscriptionTypeRow[]> {
	return await db.select().from(subscriptionTypes).where(eq(subscriptionTypes.enabled, true));
}

/** This period's counter row, or null before the first billed creation. */
export async function findAiUsage(
	db: Db,
	userId: string,
	period: AiUsagePeriod
): Promise<AiUsageTrackingRow | null> {
	const [row] = await db
		.select()
		.from(aiUsageTracking)
		.where(
			and(
				eq(aiUsageTracking.userId, userId),
				eq(aiUsageTracking.month, period.month),
				eq(aiUsageTracking.year, period.year)
			)
		)
		.limit(1);
	return row ?? null;
}

/** One billed creation: the user, the period and the caller's `now`. */
export type AiUsageIncrement = AiUsagePeriod & { readonly userId: string; readonly now: Date };

/**
 * Count one billed creation and answer the period's new total. An existing row
 * is incremented in place (`used + 1`); the first one is inserted with 1. The
 * upsert means two concurrent calls cannot lose a count, unlike the legacy
 * read-then-write.
 */
export async function incrementAiUsage(db: Db, input: AiUsageIncrement): Promise<number> {
	const [row] = await db
		.insert(aiUsageTracking)
		.values({
			userId: input.userId,
			month: input.month,
			year: input.year,
			aiEventCreationsUsed: 1,
			createdAt: input.now,
			updatedAt: input.now
		})
		.onConflictDoUpdate({
			target: [aiUsageTracking.userId, aiUsageTracking.month, aiUsageTracking.year],
			set: {
				aiEventCreationsUsed: sql`${aiUsageTracking.aiEventCreationsUsed} + 1`,
				updatedAt: input.now
			}
		})
		.returning({ used: aiUsageTracking.aiEventCreationsUsed });
	if (!row) throw new Error('incrementAiUsage: upsert returned no row');
	return row.used;
}

/** The discounts one person holds (their row ids feed the lifetime eligibility read). */
export async function listUserDiscounts(db: Db, userId: string): Promise<UserDiscountRow[]> {
	return await db.select().from(userDiscounts).where(eq(userDiscounts.userId, userId));
}

/** The discounts a page may offer: an enabled row only. */
export async function listEnabledDiscounts(db: Db): Promise<DiscountRow[]> {
	return await db.select().from(discounts).where(eq(discounts.enabled, true));
}

/**
 * Store one claimed discount, stamped `appliedAt = now` (the caller's clock,
 * never the column default). Idempotency is policy (the service checks for an
 * existing row first), so this is a plain insert and the returned row.
 */
export async function insertUserDiscount(
	db: Db,
	input: { readonly userId: string; readonly discountId: string; readonly now: Date }
): Promise<UserDiscountRow> {
	const [row] = await db
		.insert(userDiscounts)
		.values({ userId: input.userId, discountId: input.discountId, appliedAt: input.now })
		.returning();
	if (!row) throw new Error('insertUserDiscount: insert returned no row');
	return row;
}

/**
 * Write the seed's tiers, keeping any row that already has the id (the legacy
 * `.onConflictDoNothing()`, so re-running the seed changes nothing). Stamps
 * `createdAt`/`updatedAt` with the caller's `now`.
 */
export async function insertTiersIfAbsent(
	db: Db,
	tiers: readonly NewSubscriptionTypeRow[],
	now: Date
): Promise<void> {
	if (tiers.length === 0) return;
	await db
		.insert(subscriptionTypes)
		.values(tiers.map((tier) => ({ ...tier, createdAt: now, updatedAt: now })))
		.onConflictDoNothing();
}

/**
 * Write the seed's discounts, with the same insert-if-absent rule and the same
 * explicit timestamps as `insertTiersIfAbsent`.
 */
export async function insertDiscountsIfAbsent(
	db: Db,
	rows: readonly NewDiscountRow[],
	now: Date
): Promise<void> {
	if (rows.length === 0) return;
	await db
		.insert(discounts)
		.values(rows.map((row) => ({ ...row, createdAt: now, updatedAt: now })))
		.onConflictDoNothing();
}
