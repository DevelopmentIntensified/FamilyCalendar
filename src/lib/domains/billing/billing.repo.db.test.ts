/**
 * The billing repo against real Postgres: every query that filters, orders or
 * upserts. Each test runs in `rollbackTest`, so the rows it seeds vanish
 * afterwards. Writes are given their `now`, so the tests assert the stamped
 * timestamps instead of trusting a clock.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { aiUsageTracking, discounts, subscriptionTypes } from '$lib/kernel/db/tables.server';
import { seedUser, uniqueSuffix } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import {
	seedAiUsage,
	seedDiscount,
	seedSubscription,
	seedTier,
	seedUserDiscount
} from './billing.fixtures.server';
import {
	findActiveSubscription,
	findAiUsage,
	findTier,
	incrementAiUsage,
	insertDiscountsIfAbsent,
	insertTiersIfAbsent,
	insertUserDiscount,
	listEnabledDiscounts,
	listEnabledTiers,
	listUserDiscounts
} from './billing.repo.server';

const NOW = new Date('2026-06-01T00:00:00.000Z');
const LATER = new Date('2026-06-02T00:00:00.000Z');

describe('subscriptions and tiers', () => {
	rollbackTest(
		'findActiveSubscription skips expired and untiered rows and takes the newest',
		async (db) => {
			const user = await seedUser(db);
			const otherUser = await seedUser(db);
			const tier = await seedTier(db);
			const expired = await seedSubscription(db, user.id, {
				subscriptionTypeId: tier.id,
				endDate: new Date('2026-05-01T00:00:00Z'),
				createdAt: new Date('2026-05-30T00:00:00Z')
			});
			await seedSubscription(db, user.id, {
				subscriptionTypeId: null,
				endDate: new Date('2999-01-01T00:00:00Z'),
				createdAt: new Date('2026-05-31T00:00:00Z')
			});
			await seedSubscription(db, user.id, {
				subscriptionTypeId: tier.id,
				createdAt: new Date('2026-01-01T00:00:00Z')
			});
			const newest = await seedSubscription(db, user.id, {
				subscriptionTypeId: tier.id,
				createdAt: new Date('2026-02-01T00:00:00Z')
			});
			await seedSubscription(db, otherUser.id, {
				subscriptionTypeId: tier.id,
				createdAt: new Date('2026-03-01T00:00:00Z')
			});

			const active = await findActiveSubscription(db, user.id, NOW);
			expect(active?.id).toBe(newest.id);
			expect(active?.id).not.toBe(expired.id);
		}
	);

	rollbackTest('findActiveSubscription treats an end date of exactly now as expired', async (db) => {
		const user = await seedUser(db);
		const tier = await seedTier(db);
		await seedSubscription(db, user.id, { subscriptionTypeId: tier.id, endDate: NOW });

		expect(await findActiveSubscription(db, user.id, NOW)).toBeNull();
	});

	rollbackTest('findTier returns the row for an id and null for an unknown one', async (db) => {
		const tier = await seedTier(db, { name: 'Cal Master Monthly', tierName: 'cal_master' });

		expect((await findTier(db, tier.id))?.name).toBe('Cal Master Monthly');
		expect(await findTier(db, 'missing-tier')).toBeNull();
	});

	rollbackTest('listEnabledTiers lists only enabled rows', async (db) => {
		const enabled = await seedTier(db);
		const disabled = await seedTier(db, { enabled: false });

		const rows = await listEnabledTiers(db);
		expect(rows.map((row) => row.id)).toContain(enabled.id);
		expect(rows.map((row) => row.id)).not.toContain(disabled.id);
		expect(rows.every((row) => row.enabled)).toBe(true);
	});
});

describe('AI usage', () => {
	rollbackTest('findAiUsage matches one user, month and year', async (db) => {
		const user = await seedUser(db);
		const otherUser = await seedUser(db);
		await seedAiUsage(db, user.id, { month: 3, year: 2026, aiEventCreationsUsed: 4 });
		await seedAiUsage(db, user.id, { month: 4, year: 2026 });
		await seedAiUsage(db, otherUser.id, { month: 3, year: 2026 });

		expect((await findAiUsage(db, user.id, { month: 3, year: 2026 }))?.aiEventCreationsUsed).toBe(
			4
		);
		expect(await findAiUsage(db, user.id, { month: 3, year: 2027 })).toBeNull();
	});

	rollbackTest('incrementAiUsage inserts the first count and stamps both timestamps', async (db) => {
		const user = await seedUser(db);

		const used = await incrementAiUsage(db, { userId: user.id, month: 3, year: 2026, now: NOW });

		expect(used).toBe(1);
		const [row] = await db
			.select()
			.from(aiUsageTracking)
			.where(eq(aiUsageTracking.userId, user.id));
		expect(row?.aiEventCreationsUsed).toBe(1);
		expect(row?.createdAt.getTime()).toBe(NOW.getTime());
		expect(row?.updatedAt.getTime()).toBe(NOW.getTime());
	});

	rollbackTest('incrementAiUsage keeps one row per period and counts every call', async (db) => {
		const user = await seedUser(db);

		await incrementAiUsage(db, { userId: user.id, month: 3, year: 2026, now: NOW });
		const used = await incrementAiUsage(db, {
			userId: user.id,
			month: 3,
			year: 2026,
			now: LATER
		});

		expect(used).toBe(2);
		const rows = await db
			.select()
			.from(aiUsageTracking)
			.where(eq(aiUsageTracking.userId, user.id));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.aiEventCreationsUsed).toBe(2);
		expect(rows[0]?.createdAt.getTime()).toBe(NOW.getTime());
		expect(rows[0]?.updatedAt.getTime()).toBe(LATER.getTime());
	});
});

describe('discounts', () => {
	rollbackTest("listUserDiscounts keeps only the given person's claims", async (db) => {
		const user = await seedUser(db);
		const otherUser = await seedUser(db);
		const mine = await seedDiscount(db, { name: 'Mine' });
		const theirs = await seedDiscount(db, { name: 'Theirs' });
		await seedUserDiscount(db, user.id, mine.id);
		await seedUserDiscount(db, otherUser.id, theirs.id);

		const rows = await listUserDiscounts(db, user.id);
		expect(rows.map((row) => row.discountId)).toEqual([mine.id]);
	});

	rollbackTest('insertUserDiscount stores the claim at the given instant', async (db) => {
		const user = await seedUser(db);
		const discount = await seedDiscount(db);

		const row = await insertUserDiscount(db, {
			userId: user.id,
			discountId: discount.id,
			now: NOW
		});

		expect(row.discountId).toBe(discount.id);
		expect(row.appliedAt.getTime()).toBe(NOW.getTime());
	});

	rollbackTest('listEnabledDiscounts lists only enabled rows', async (db) => {
		const enabled = await seedDiscount(db);
		const disabled = await seedDiscount(db, { enabled: false });

		const rows = await listEnabledDiscounts(db);
		expect(rows.map((row) => row.id)).toContain(enabled.id);
		expect(rows.map((row) => row.id)).not.toContain(disabled.id);
		expect(rows.every((row) => row.enabled)).toBe(true);
	});
});

describe('seed writes', () => {
	rollbackTest('insertTiersIfAbsent never overwrites an existing id', async (db) => {
		const id = `tier-${uniqueSuffix()}`;
		const tier = (name: string) => ({
			id,
			name,
			tierName: 'free',
			displayName: name,
			durationMonths: 0
		});

		await insertTiersIfAbsent(db, [tier('Free')], NOW);
		await insertTiersIfAbsent(db, [tier('Renamed')], LATER);

		const rows = await db
			.select()
			.from(subscriptionTypes)
			.where(eq(subscriptionTypes.id, id));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.name).toBe('Free');
		expect(rows[0]?.createdAt.getTime()).toBe(NOW.getTime());
	});

	rollbackTest('insertDiscountsIfAbsent never overwrites an existing id', async (db) => {
		const id = `discount-${uniqueSuffix()}`;
		const discount = (name: string) => ({
			id,
			name,
			discountRate: 20,
			appliesToLifetime: true
		});

		await insertDiscountsIfAbsent(db, [discount('Lifetime Discount')], NOW);
		await insertDiscountsIfAbsent(db, [discount('Renamed')], LATER);

		const rows = await db.select().from(discounts).where(eq(discounts.id, id));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.name).toBe('Lifetime Discount');
		expect(rows[0]?.createdAt.getTime()).toBe(NOW.getTime());
	});
});
