/**
 * The dev seed against real Postgres: `runDevSeed(ctx)` writes the legacy
 * `src/lib/server/seed.ts` data — six tiers, two discounts, five demo ad rows —
 * and a second run writes nothing.
 *
 * Every expected value is the legacy seed's (`git show
 * 66a11131:src/lib/server/seed.ts`), with two exceptions the port already
 * documented: the tier/discount timestamps are stamped with the caller's clock
 * by billing's insert-if-absent (rule R5; the legacy rows used the column
 * default), and the demo counters, which the legacy seed drew at random, are
 * derived from the row id by sponsored's seeded draw (R5 bans the global
 * generator), so one database always gets the same demo numbers.
 *
 * Rows are read through `$lib/kernel/db/tables.server` (a `*.db.test.ts` may
 * import it, R3), not another module's fixtures, so this file pins the seed
 * against the schema itself.
 *
 * Doc: ./README.md#how-to-test
 */
import { asc } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import type { Db } from '$lib/kernel/db/database.server';
import { adEvents, discounts, subscriptionTypes } from '$lib/kernel/db/tables.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { runDevSeed } from './devSeed.server';

/** Noon on 1 June 2026: the ads' week/30-day maths never crosses a DST edge. */
const NOW = '2026-06-01T12:00:00.000Z';

/** The six legacy tiers, sorted by id, without the clock-stamped timestamps. */
const LEGACY_TIERS = [
	{
		id: 'cal-master-annual',
		name: 'Cal Master Annual',
		tierName: 'cal_master',
		planType: 'individual',
		displayName: 'Cal Master',
		durationMonths: 12,
		enabled: true,
		familyLimit: 1,
		memberLimit: 6,
		retentionViewDays: 3650,
		archivedRetentionDays: 3650,
		attachmentLimitBytes: 1073741824,
		aiEventCreationsPerMonth: 999999,
		exportImportEnabled: true
	},
	{
		id: 'cal-master-monthly',
		name: 'Cal Master Monthly',
		tierName: 'cal_master',
		planType: 'individual',
		displayName: 'Cal Master',
		durationMonths: 1,
		enabled: true,
		familyLimit: 1,
		memberLimit: 6,
		retentionViewDays: 3650,
		archivedRetentionDays: 3650,
		attachmentLimitBytes: 1073741824,
		aiEventCreationsPerMonth: 999999,
		exportImportEnabled: true
	},
	{
		id: 'family-master-annual',
		name: 'Family Master Annual',
		tierName: 'family_master',
		planType: 'family',
		displayName: 'Family Master',
		durationMonths: 12,
		enabled: true,
		familyLimit: 999,
		memberLimit: 999,
		retentionViewDays: 3650,
		archivedRetentionDays: 3650,
		attachmentLimitBytes: 1073741824,
		aiEventCreationsPerMonth: 999999,
		exportImportEnabled: true
	},
	{
		id: 'family-master-lifetime',
		name: 'Family Master Lifetime',
		tierName: 'family_master',
		planType: 'family',
		displayName: 'Family Master',
		durationMonths: 999,
		enabled: true,
		familyLimit: 999,
		memberLimit: 999,
		retentionViewDays: 36500,
		archivedRetentionDays: 36500,
		attachmentLimitBytes: 1073741824,
		aiEventCreationsPerMonth: 999999,
		exportImportEnabled: true
	},
	{
		id: 'family-master-monthly',
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
		exportImportEnabled: true
	},
	{
		id: 'free',
		name: 'Free',
		tierName: 'free',
		planType: 'individual',
		displayName: 'Free',
		durationMonths: 0,
		enabled: true,
		familyLimit: 1,
		memberLimit: 6,
		retentionViewDays: 30,
		archivedRetentionDays: 90,
		attachmentLimitBytes: 10485760,
		aiEventCreationsPerMonth: 10,
		exportImportEnabled: true
	}
];

/** The two legacy discounts, sorted by id, without the clock-stamped timestamps. */
const LEGACY_DISCOUNTS = [
	{
		id: 'family-member-discount',
		name: 'Family Member Discount',
		description: '40% off for families with 4+ members on annual plan',
		eligibleRole: 'family_member',
		minFamilyMembers: 4,
		discountRate: 40,
		durationMonths: 12,
		appliesToMonthly: false,
		appliesToAnnual: true,
		appliesToLifetime: false,
		stackable: true,
		enabled: true
	},
	{
		id: 'lifetime-discount',
		name: 'Lifetime Discount',
		description: '20% off lifetime plan when upgrading from annual',
		eligibleRole: 'annual_subscriber',
		minFamilyMembers: null,
		discountRate: 20,
		durationMonths: 999,
		appliesToMonthly: false,
		appliesToAnnual: false,
		appliesToLifetime: true,
		stackable: false,
		enabled: true
	}
];

/** The five legacy demo ads: `test-ad-i` starts `(i - 2)` weeks from NOW, expires 30 days later. */
const LEGACY_ADS = [
	{
		id: 'test-ad-1',
		sponsorName: 'Local Store',
		message: 'Summer Sale! Get 50% off',
		ctaText: 'Shop Now',
		ctaLink: 'https://example.com/sale',
		targetPlan: 'free',
		deadline: null,
		scheduledFor: new Date('2026-05-18T12:00:00.000Z'),
		expiresAt: new Date('2026-06-17T12:00:00.000Z'),
		impressions: 93,
		clicks: 5,
		conversions: 0
	},
	{
		id: 'test-ad-2',
		sponsorName: 'Family Products',
		message: 'Check out our latest family organizer',
		ctaText: 'Learn More',
		ctaLink: 'https://example.com/product',
		targetPlan: 'free',
		deadline: null,
		scheduledFor: new Date('2026-05-25T12:00:00.000Z'),
		expiresAt: new Date('2026-06-24T12:00:00.000Z'),
		impressions: 28,
		clicks: 8,
		conversions: 0
	},
	{
		id: 'test-ad-3',
		sponsorName: 'Recipe Club',
		message: 'Share your favorite family recipes',
		ctaText: 'Join',
		ctaLink: 'https://example.com/recipes',
		targetPlan: 'free',
		deadline: null,
		scheduledFor: new Date('2026-06-01T12:00:00.000Z'),
		expiresAt: new Date('2026-07-01T12:00:00.000Z'),
		impressions: 91,
		clicks: 8,
		conversions: 0
	},
	{
		id: 'test-ad-4',
		sponsorName: 'Holiday Helpers',
		message: 'Start planning your holiday events early',
		ctaText: 'Get Tips',
		ctaLink: 'https://example.com/holidays',
		targetPlan: 'free',
		deadline: null,
		scheduledFor: new Date('2026-06-08T12:00:00.000Z'),
		expiresAt: new Date('2026-07-08T12:00:00.000Z'),
		impressions: 34,
		clicks: 9,
		conversions: 0
	},
	{
		id: 'test-ad-5',
		sponsorName: 'School Tools',
		message: 'Organize your school schedules',
		ctaText: 'Sign Up',
		ctaLink: 'https://example.com/school',
		targetPlan: 'free',
		deadline: null,
		scheduledFor: new Date('2026-06-15T12:00:00.000Z'),
		expiresAt: new Date('2026-07-15T12:00:00.000Z'),
		impressions: 69,
		clicks: 7,
		conversions: 0
	}
];

async function tierRows(db: Db) {
	return await db
		.select({
			id: subscriptionTypes.id,
			name: subscriptionTypes.name,
			tierName: subscriptionTypes.tierName,
			planType: subscriptionTypes.planType,
			displayName: subscriptionTypes.displayName,
			durationMonths: subscriptionTypes.durationMonths,
			enabled: subscriptionTypes.enabled,
			familyLimit: subscriptionTypes.familyLimit,
			memberLimit: subscriptionTypes.memberLimit,
			retentionViewDays: subscriptionTypes.retentionViewDays,
			archivedRetentionDays: subscriptionTypes.archivedRetentionDays,
			attachmentLimitBytes: subscriptionTypes.attachmentLimitBytes,
			aiEventCreationsPerMonth: subscriptionTypes.aiEventCreationsPerMonth,
			exportImportEnabled: subscriptionTypes.exportImportEnabled
		})
		.from(subscriptionTypes)
		.orderBy(asc(subscriptionTypes.id));
}

async function discountRows(db: Db) {
	return await db
		.select({
			id: discounts.id,
			name: discounts.name,
			description: discounts.description,
			eligibleRole: discounts.eligibleRole,
			minFamilyMembers: discounts.minFamilyMembers,
			discountRate: discounts.discountRate,
			durationMonths: discounts.durationMonths,
			appliesToMonthly: discounts.appliesToMonthly,
			appliesToAnnual: discounts.appliesToAnnual,
			appliesToLifetime: discounts.appliesToLifetime,
			stackable: discounts.stackable,
			enabled: discounts.enabled
		})
		.from(discounts)
		.orderBy(asc(discounts.id));
}

async function adRows(db: Db) {
	return await db
		.select({
			id: adEvents.id,
			sponsorName: adEvents.sponsorName,
			message: adEvents.message,
			ctaText: adEvents.ctaText,
			ctaLink: adEvents.ctaLink,
			targetPlan: adEvents.targetPlan,
			deadline: adEvents.deadline,
			scheduledFor: adEvents.scheduledFor,
			expiresAt: adEvents.expiresAt,
			impressions: adEvents.impressions,
			clicks: adEvents.clicks,
			conversions: adEvents.conversions
		})
		.from(adEvents)
		.orderBy(asc(adEvents.id));
}

describe('runDevSeed', () => {
	rollbackTest('writes the legacy rows once however many times it runs', async (db) => {
		const ctx = testCtx({ db, now: NOW });

		await runDevSeed(ctx);
		await runDevSeed(ctx);

		expect(await tierRows(db)).toEqual(LEGACY_TIERS);
		expect(await discountRows(db)).toEqual(LEGACY_DISCOUNTS);
		expect(await adRows(db)).toEqual(LEGACY_ADS);
		// The second run is a no-op: five ads the first time, none the second.
		expect(ctx.log.entries.map((entry) => entry.fields)).toEqual([
			{ demoAds: 5 },
			{ demoAds: 0 }
		]);
	});
});
