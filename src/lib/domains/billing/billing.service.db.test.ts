/**
 * The billing services against real Postgres: the plan read other modules gate
 * on, the AI allowance and its cap, the discount rules the checkout page
 * shows, the idempotent seed and the delete slice the account composition
 * needs. Each test is titled after the README Invariant it pins, and every
 * refusal is asserted by its `AppError` code and copy.
 *
 * Doc: ./README.md#how-to-test
 */
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import {
	aiUsageTracking,
	discounts,
	subscriptions,
	subscriptionTypes,
	userDiscounts
} from '$lib/kernel/db/tables.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { FREE_PLAN_LIMITS } from './billing.limits.rules';
import {
	seedAiUsage,
	seedDiscount,
	seedSubscription,
	seedTier,
	seedUserDiscount
} from './billing.fixtures.server';
import {
	applyUserDiscount,
	assertAiAvailable,
	deleteSubscriptionsForPerson,
	ensureBillingDefaults,
	getCheckoutQuote,
	getPlanLimits,
	getSubscriptionSummary,
	isPaidCaller,
	listEligibleDiscounts,
	recordAiCreation,
	recordPlanView
} from './billing.service.server';

/** A fixed instant in the middle of June 2026: the AI counter's month is 6. */
const NOW = '2026-06-01T00:00:00.000Z';
const AI_CAP_COPY = 'AI feature limit reached (10 per month). Upgrade to unlock unlimited AI.';

describe('getSubscriptionSummary', () => {
	it('degrades to no subscription and the free defaults when a read fails', async () => {
		const refuse = (): never => {
			throw new Error('read failed');
		};
		// SAFETY: every property access is meant to throw; no Db member is called.
		const db = new Proxy({}, { get: refuse, apply: refuse }) as unknown as Db;
		const ctx = testCtx({ db, now: NOW });

		const summary = await getSubscriptionSummary(ctx, {
			id: 'user-1',
			email: null,
			isAdmin: false,
			via: 'session'
		});

		expect(summary).toEqual({
			subscription: { tier: null, subscription: null },
			planLimits: { ...FREE_PLAN_LIMITS },
			aiUsage: { used: 0, limit: 10, remaining: 10 },
			planPricing: { monthly: 9, annual: 90, lifetime: 150, monthlyEquivalent: 7.5 }
		});
		expect(ctx.log.entries).toContainEqual(
			expect.objectContaining({ level: 'error', event: 'subscription_summary_failed' })
		);
	});

	// The window is legacy's (`subscriptionService.ts:334-349`): the UTC month and
	// year of the clock, compared against the counter's `month`/`year` columns.
	// The golden seeds the ambient month and cannot pin the edges; this does.
	rollbackTest("counts only the injected clock's UTC month, across a month edge", async (db) => {
		const user = await seedUser(db);
		await seedAiUsage(db, user.id, { month: 12, year: 2025, aiEventCreationsUsed: 4 });
		await seedAiUsage(db, user.id, { month: 6, year: 2026, aiEventCreationsUsed: 6 });
		await seedAiUsage(db, user.id, { month: 7, year: 2026, aiEventCreationsUsed: 5 });

		const june = testCtx({ db, now: '2026-06-30T23:59:59.999Z' });
		const atJuneEnd = await getSubscriptionSummary(june, actorFromUser(user, 'session'));
		expect(atJuneEnd.aiUsage).toEqual({ used: 6, limit: 10, remaining: 4 });

		const july = testCtx({ db, now: '2026-07-01T00:00:00.000Z' });
		const atJulyStart = await getSubscriptionSummary(july, actorFromUser(user, 'session'));
		expect(atJulyStart.aiUsage).toEqual({ used: 5, limit: 10, remaining: 5 });

		// Last December's row is neither this month's nor a fallback.
		const january = testCtx({ db, now: '2026-01-31T12:00:00.000Z' });
		const inJanuary = await getSubscriptionSummary(january, actorFromUser(user, 'session'));
		expect(inJanuary.aiUsage).toEqual({ used: 0, limit: 10, remaining: 10 });
	});
});

describe('getPlanLimits', () => {
	rollbackTest("resolves the member limit from the family creator's plan", async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const creator = await seedUser(db);
		const viewer = await seedUser(db);
		const tier = await seedTier(db, { memberLimit: 5, familyLimit: 2 });
		await seedSubscription(db, creator.id, { subscriptionTypeId: tier.id });

		expect(
			await getPlanLimits(ctx, actorFromUser(viewer, 'session'), { personId: creator.id })
		).toMatchObject({ memberLimit: 5, familyLimit: 2 });
		expect(await getPlanLimits(ctx, actorFromUser(viewer, 'session'))).toMatchObject({
			memberLimit: 6,
			familyLimit: 1
		});
	});

	rollbackTest('answers the free policy when no active row exists', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const user = await seedUser(db);
		await seedSubscription(db, user.id, { subscriptionTypeId: null });
		const expiredTier = await seedTier(db, { memberLimit: 3 });
		await seedSubscription(db, user.id, {
			subscriptionTypeId: expiredTier.id,
			endDate: new Date('2020-01-01T00:00:00.000Z')
		});

		expect(await getPlanLimits(ctx, actorFromUser(user, 'session'))).toEqual({
			...FREE_PLAN_LIMITS
		});
	});
});

describe('isPaidCaller', () => {
	rollbackTest('treats a non-free active tier as paid and no row as free', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const paid = await seedUser(db);
		const freeTiered = await seedUser(db);
		const bare = await seedUser(db);
		const paidTier = await seedTier(db, { tierName: 'family_master' });
		const freeTier = await seedTier(db, { tierName: 'free' });
		await seedSubscription(db, paid.id, { subscriptionTypeId: paidTier.id });
		await seedSubscription(db, freeTiered.id, { subscriptionTypeId: freeTier.id });

		expect(await isPaidCaller(ctx, actorFromUser(paid, 'session'))).toBe(true);
		expect(await isPaidCaller(ctx, actorFromUser(freeTiered, 'session'))).toBe(false);
		expect(await isPaidCaller(ctx, actorFromUser(bare, 'session'))).toBe(false);
	});
});

describe('assertAiAvailable', () => {
	rollbackTest('refuses an over-cap AI creation', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const under = await seedUser(db);
		const over = await seedUser(db);
		await seedAiUsage(db, under.id, { month: 6, year: 2026, aiEventCreationsUsed: 1 });
		await seedAiUsage(db, over.id, { month: 6, year: 2026, aiEventCreationsUsed: 10 });

		expect(await assertAiAvailable(ctx, actorFromUser(under, 'session'))).toEqual({
			used: 1,
			limit: 10,
			remaining: 9
		});
		await expect(assertAiAvailable(ctx, actorFromUser(over, 'session'))).rejects.toMatchObject({
			code: 'tooMany',
			message: AI_CAP_COPY
		});
	});
});

describe('recordAiCreation', () => {
	rollbackTest('counts usage even when the vendor returned nothing', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const user = await seedUser(db);

		expect(await recordAiCreation(ctx, actorFromUser(user, 'session'))).toEqual({
			used: 1,
			limit: 10,
			remaining: 9
		});
		expect(await recordAiCreation(ctx, actorFromUser(user, 'session'))).toEqual({
			used: 2,
			limit: 10,
			remaining: 8
		});

		const rows = await db
			.select()
			.from(aiUsageTracking)
			.where(and(eq(aiUsageTracking.userId, user.id), eq(aiUsageTracking.month, 6)));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.aiEventCreationsUsed).toBe(2);
	});
});

describe('applyUserDiscount', () => {
	rollbackTest('applying the same discount twice is a no-op', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const user = await seedUser(db);
		const discount = await seedDiscount(db);

		expect(await applyUserDiscount(ctx, actorFromUser(user, 'session'), discount.id)).toEqual({
			applied: true,
			message: 'Discount applied successfully'
		});
		expect(await applyUserDiscount(ctx, actorFromUser(user, 'session'), discount.id)).toEqual({
			applied: false,
			message: 'Discount already applied'
		});

		const rows = await db.select().from(userDiscounts).where(eq(userDiscounts.userId, user.id));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.appliedAt).toEqual(new Date(NOW));
	});
});

describe('getCheckoutQuote', () => {
	rollbackTest('needs a matching enabled discount row for each line', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const user = await seedUser(db);

		const withoutRow = await getCheckoutQuote(ctx, actorFromUser(user, 'session'), {
			plan: 'annual',
			familyMemberCount: 5
		});
		expect(withoutRow).toMatchObject({
			originalPrice: 90,
			discountPercentage: 0,
			discountAmount: 0,
			finalPrice: 90,
			appliedDiscounts: []
		});

		const row = await seedDiscount(db, {
			name: 'Family Member Discount',
			discountRate: 40,
			appliesToAnnual: true,
			appliesToLifetime: false
		});
		const withRow = await getCheckoutQuote(ctx, actorFromUser(user, 'session'), {
			plan: 'annual',
			familyMemberCount: 5
		});
		expect(withRow).toMatchObject({
			originalPrice: 90,
			discountPercentage: 40,
			discountAmount: 36,
			finalPrice: 54,
			appliedDiscounts: [
				{ discountId: row.id, name: 'Family Member Discount', percentage: 40, amount: 36 }
			]
		});
	});

	rollbackTest('stacks the held lifetime discount on lifetime only', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const user = await seedUser(db);
		const family = await seedDiscount(db, {
			name: 'Family Member Discount',
			discountRate: 40,
			appliesToAnnual: true,
			appliesToLifetime: false
		});
		const lifetime = await seedDiscount(db, {
			name: 'Lifetime Discount',
			discountRate: 20,
			appliesToLifetime: true
		});
		await seedUserDiscount(db, user.id, lifetime.id);

		const quote = await getCheckoutQuote(ctx, actorFromUser(user, 'session'), {
			plan: 'lifetime',
			familyMemberCount: 5
		});
		expect(quote).toMatchObject({
			originalPrice: 150,
			discountPercentage: 60,
			discountAmount: 90,
			finalPrice: 60
		});
		expect(quote.appliedDiscounts.map((line) => line.amount).sort((a, b) => a - b)).toEqual([30, 60]);
		expect(
			quote.appliedDiscounts.every(
				(line) => line.discountId === family.id || line.discountId === lifetime.id
			)
		).toBe(true);

		const annual = await getCheckoutQuote(ctx, actorFromUser(user, 'session'), {
			plan: 'annual',
			familyMemberCount: 5
		});
		expect(annual).toMatchObject({ discountPercentage: 40, discountAmount: 36, finalPrice: 54 });
		expect(annual.appliedDiscounts).toHaveLength(1);
	});
});

describe('listEligibleDiscounts', () => {
	rollbackTest('keeps the legacy descriptions', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const user = await seedUser(db);
		await seedDiscount(db, { discountRate: 20, appliesToLifetime: true });

		expect(
			await listEligibleDiscounts(ctx, actorFromUser(user, 'session'), { familyMemberCount: 5 })
		).toEqual([
			{
				eligible: true,
				discountType: 'family_size',
				percentage: 40,
				description: 'Family member discount (5+ members)'
			},
			{
				eligible: true,
				discountType: 'lifetime',
				percentage: 20,
				description: 'Lifetime subscriber discount'
			}
		]);

		expect(
			await listEligibleDiscounts(ctx, actorFromUser(user, 'session'), { familyMemberCount: 4 })
		).toEqual([
			{
				eligible: true,
				discountType: 'lifetime',
				percentage: 20,
				description: 'Lifetime subscriber discount'
			}
		]);
	});
});

describe('ensureBillingDefaults', () => {
	rollbackTest('is idempotent and writes six tiers', async (db) => {
		const ctx = testCtx({ db, now: NOW });

		await ensureBillingDefaults(ctx);
		await ensureBillingDefaults(ctx);

		const tiers = await db.select().from(subscriptionTypes);
		const discountRows = await db.select().from(discounts);
		expect(tiers).toHaveLength(6);
		expect(discountRows).toHaveLength(2);
		expect(tiers.find((tier) => tier.id === 'free')).toMatchObject({
			tierName: 'free',
			memberLimit: 6,
			aiEventCreationsPerMonth: 10
		});
		expect(tiers.find((tier) => tier.id === 'family-master-lifetime')).toMatchObject({
			durationMonths: 999,
			familyLimit: 999
		});
		expect(discountRows.find((row) => row.id === 'family-member-discount')).toMatchObject({
			discountRate: 40,
			minFamilyMembers: 4
		});
	});
});

describe('recordPlanView', () => {
	rollbackTest('a plan view logs one pricing_view entry', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const user = await seedUser(db);

		recordPlanView(ctx, actorFromUser(user, 'session'), 'view');

		expect(ctx.log.entries).toEqual([
			{ level: 'info', event: 'pricing_view', fields: { userId: user.id, planType: 'view' } }
		]);
	});
});

describe('deleteSubscriptionsForPerson', () => {
	rollbackTest("removes only that person's subscription rows", async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const user = await seedUser(db);
		const other = await seedUser(db);
		const tier = await seedTier(db);
		await seedSubscription(db, user.id, { subscriptionTypeId: tier.id });
		await seedSubscription(db, user.id, { subscriptionTypeId: null });
		await seedSubscription(db, other.id, { subscriptionTypeId: tier.id });

		await deleteSubscriptionsForPerson(ctx, actorFromUser(user, 'session'), { personId: user.id });

		expect(
			await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id))
		).toHaveLength(0);
		expect(
			await db.select().from(subscriptions).where(eq(subscriptions.userId, other.id))
		).toHaveLength(1);
	});

	rollbackTest("refuses another person's deletion", async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const user = await seedUser(db);
		const other = await seedUser(db);
		const tier = await seedTier(db);
		await seedSubscription(db, user.id, { subscriptionTypeId: tier.id });

		await expect(
			deleteSubscriptionsForPerson(ctx, actorFromUser(other, 'session'), { personId: user.id })
		).rejects.toMatchObject({ code: 'forbidden' });
		expect(
			await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id))
		).toHaveLength(1);
	});
});
