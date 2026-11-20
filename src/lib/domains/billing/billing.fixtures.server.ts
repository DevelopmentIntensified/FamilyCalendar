/**
 * Row builders for billing's db tests: the tiers, subscription rows, discounts,
 * claimed discounts and AI counters the repo and service tests need, in one
 * home (so a schema change updates one file). Kernel seeds only users; a test
 * never inserts one of this module's rows directly.
 *
 * Defaults are readable, not random — except the ids, which carry
 * `uniqueSuffix()` because a test may seed two rows of the same kind and both
 * `subscriptionTypes.id` and `discounts.id` are primary keys.
 *
 * Doc: ./README.md#how-to-test
 */
import type { Db } from '$lib/kernel/db/database.server';
import {
	discounts,
	type DiscountRow,
	type NewAiUsageTrackingRow,
	type NewDiscountRow,
	type NewSubscriptionRow,
	type NewSubscriptionTypeRow,
	type NewUserDiscountRow,
	subscriptions,
	type SubscriptionRow,
	subscriptionTypes,
	type SubscriptionTypeRow,
	userDiscounts,
	type UserDiscountRow,
	aiUsageTracking,
	type AiUsageTrackingRow
} from '$lib/kernel/db/tables.server';
import { uniqueSuffix } from '$lib/kernel/testing/seedRows.server';

const ANCHOR = new Date('2026-01-05T00:00:00.000Z');
const FAR_FUTURE = new Date('2999-01-01T00:00:00.000Z');

/** One subscription tier; override `id`/`tierName` to tell two tiers apart. */
export async function seedTier(
	db: Db,
	overrides: Partial<NewSubscriptionTypeRow> = {}
): Promise<SubscriptionTypeRow> {
	const [row] = await db
		.insert(subscriptionTypes)
		.values({
			id: overrides.id ?? `tier-${uniqueSuffix()}`,
			name: 'Family Master Monthly',
			tierName: 'family_master',
			planType: 'family',
			displayName: 'Family Master',
			durationMonths: 1,
			enabled: true,
			familyLimit: 999,
			memberLimit: 999,
			retentionViewDays: 3650,
			archivedRetentionDays: 3650,
			attachmentLimitBytes: 1073741824,
			aiEventCreationsPerMonth: 999999,
			exportImportEnabled: true,
			...overrides
		})
		.returning();
	if (!row) throw new Error('seedTier: insert returned no row');
	return row;
}

/** One subscription row for `userId`; pass `subscriptionTypeId` to make it active. */
export async function seedSubscription(
	db: Db,
	userId: string,
	overrides: Partial<NewSubscriptionRow> = {}
): Promise<SubscriptionRow> {
	const [row] = await db
		.insert(subscriptions)
		.values({
			userId,
			subscriptionTypeId: null,
			notificationMethods: { email: true, sms: false },
			startDate: ANCHOR,
			endDate: FAR_FUTURE,
			createdAt: ANCHOR,
			...overrides
		})
		.returning();
	if (!row) throw new Error('seedSubscription: insert returned no row');
	return row;
}

/** One discount row; the default is the seed's lifetime 20%. */
export async function seedDiscount(
	db: Db,
	overrides: Partial<NewDiscountRow> = {}
): Promise<DiscountRow> {
	const [row] = await db
		.insert(discounts)
		.values({
			id: `discount-${uniqueSuffix()}`,
			name: 'Lifetime Discount',
			discountRate: 20,
			appliesToLifetime: true,
			enabled: true,
			...overrides
		})
		.returning();
	if (!row) throw new Error('seedDiscount: insert returned no row');
	return row;
}

/** One claimed discount for a person, stamped at the anchor unless overridden. */
export async function seedUserDiscount(
	db: Db,
	userId: string,
	discountId: string,
	overrides: Partial<NewUserDiscountRow> = {}
): Promise<UserDiscountRow> {
	const [row] = await db
		.insert(userDiscounts)
		.values({ userId, discountId, appliedAt: ANCHOR, ...overrides })
		.returning();
	if (!row) throw new Error('seedUserDiscount: insert returned no row');
	return row;
}

/** One AI counter row; the default is March 2026 with a single creation. */
export async function seedAiUsage(
	db: Db,
	userId: string,
	overrides: Partial<NewAiUsageTrackingRow> = {}
): Promise<AiUsageTrackingRow> {
	const [row] = await db
		.insert(aiUsageTracking)
		.values({ userId, month: 3, year: 2026, aiEventCreationsUsed: 1, ...overrides })
		.returning();
	if (!row) throw new Error('seedAiUsage: insert returned no row');
	return row;
}
