/**
 * billing services: the plan card's read model, the one plan-policy read other
 * modules gate on, the AI allowance and its cap, the checkout quote and the
 * discount lists the marketing pages show, the idempotent seed, and the delete
 * slice the account composition runs before deleting a person.
 *
 * Authorization lives here; every expected refusal is an `AppError` with the
 * legacy copy. Time comes from `ctx.clock`, money from the pure rules, and
 * every count billing needs from another module (family members, families
 * used, an event's date, attachment bytes) arrives as an argument: billing
 * owns only its five tables.
 *
 * Doc: ./README.md#public-interface
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx, type Db } from '$lib/kernel/db/database.server';
import { forbidden, tooMany } from '$lib/kernel/errors/appError';
import {
	aiAllowance,
	aiLimitRefusal,
	aiPeriod,
	isPaidTier
} from './billing.ai.rules';
import type { AiUsage, PlanLimits, SubscriptionSummaryView } from './billing.contract';
import { FREE_PLAN_LIMITS, resolvePlanLimits } from './billing.limits.rules';
import {
	checkoutQuote,
	familyDiscountRate,
	holdsLifetimeDiscount,
	lifetimeDiscountRate,
	PLAN_PRICES,
	planPricing,
	type CheckoutQuote,
	type PlanType
} from './billing.pricing.rules';
import {
	deleteSubscriptionsByUserId,
	findActiveSubscription,
	findAiUsage,
	findTier,
	incrementAiUsage,
	insertDiscountsIfAbsent,
	insertTiersIfAbsent,
	insertUserDiscount,
	listEnabledDiscounts,
	listUserDiscounts
} from './billing.repo.server';

/** One discount line the checkout page shows, attached to its repo row. */
export type AppliedCheckoutDiscount = {
	readonly discountId: string;
	readonly name: string;
	readonly percentage: number;
	readonly amount: number;
};

/** The checkout quote plus the rows each applied line came from. */
export type CheckoutQuoteView = CheckoutQuote & {
	readonly appliedDiscounts: readonly AppliedCheckoutDiscount[];
};

/** One discount the person qualifies for, in the legacy page's shape. */
export type EligibleDiscount = {
	readonly eligible: boolean;
	readonly discountType: string;
	readonly percentage: number;
	readonly description: string;
};

/** `applyUserDiscount`'s answer: idempotent, with the legacy copy. */
export type DiscountApplication = {
	readonly applied: boolean;
	readonly message: string;
};

/** The plan card's read model; a failed read degrades instead of erroring. */
export async function getSubscriptionSummary(
	ctx: Ctx,
	actor: Actor
): Promise<SubscriptionSummaryView> {
	const now = ctx.clock.now();
	try {
		const row = await findActiveSubscription(ctx.db, actor.id, now);
		const tier = row?.subscriptionTypeId ? await findTier(ctx.db, row.subscriptionTypeId) : null;
		const planLimits = resolvePlanLimits(row, tier);
		const usage = await findAiUsage(ctx.db, actor.id, aiPeriod(now));
		return {
			subscription: {
				tier: tier ?? null,
				subscription: row
					? { id: row.id, startDate: row.startDate, endDate: row.endDate, createdAt: row.createdAt }
					: null
			},
			planLimits,
			aiUsage: aiAllowance(usage?.aiEventCreationsUsed ?? 0, planLimits.aiEventCreationsPerMonth),
			planPricing: planPricing()
		};
	} catch (error) {
		ctx.log.error('subscription_summary_failed', {
			userId: actor.id,
			message: error instanceof Error ? error.message : String(error)
		});
		return {
			subscription: { tier: null, subscription: null },
			planLimits: { ...FREE_PLAN_LIMITS },
			aiUsage: aiAllowance(0, FREE_PLAN_LIMITS.aiEventCreationsPerMonth),
			planPricing: planPricing()
		};
	}
}

/**
 * The plan limits of `input.personId` (default: the caller). Limits are caps,
 * not personal data, so a caller may ask about the person whose plan gates the
 * action (family resolves a creator's member limit); the caller still gates the
 * action itself. No module gets a raw tier row.
 */
export async function getPlanLimits(
	ctx: Ctx,
	actor: Actor,
	input: { readonly personId?: string } = {}
): Promise<PlanLimits> {
	return await readPlanLimits(ctx.db, input.personId ?? actor.id, ctx.clock.now());
}

/** Paid = an active non-`free` tier; a person with no (or an expired) row is free. */
export async function isPaidCaller(ctx: Ctx, actor: Actor): Promise<boolean> {
	const now = ctx.clock.now();
	const row = await findActiveSubscription(ctx.db, actor.id, now);
	const tier = row?.subscriptionTypeId ? await findTier(ctx.db, row.subscriptionTypeId) : null;
	return isPaidTier(tier?.tierName);
}

/**
 * The AI cap, checked before the vendor call: throws `tooMany` with the
 * monthly copy when nothing remains, so a refusal costs zero vendor spend.
 */
export async function assertAiAvailable(ctx: Ctx, actor: Actor): Promise<AiUsage> {
	const allowance = await readAiAllowance(ctx, actor.id, ctx.clock.now());
	const refusal = aiLimitRefusal(allowance);
	if (refusal) throw tooMany(refusal);
	return allowance;
}

/**
 * Count one billed creation and answer the period's allowance. The caller runs
 * this after the vendor call, even when the parse returned nothing.
 */
export async function recordAiCreation(ctx: Ctx, actor: Actor): Promise<AiUsage> {
	const now = ctx.clock.now();
	const used = await incrementAiUsage(ctx.db, { userId: actor.id, ...aiPeriod(now), now });
	const limits = await readPlanLimits(ctx.db, actor.id, now);
	return aiAllowance(used, limits.aiEventCreationsPerMonth);
}

/**
 * What `input.plan` costs a person whose fullest family has
 * `input.familyMemberCount` members, after the discounts an enabled row and
 * their claims allow. The count is one family's members, not the person's
 * membership rows (Q-017 B). `appliedDiscounts` names the row behind each line;
 * the checkout page only renders the quote.
 */
export async function getCheckoutQuote(
	ctx: Ctx,
	actor: Actor,
	input: { readonly plan: PlanType; readonly familyMemberCount: number }
): Promise<CheckoutQuoteView> {
	const enabledRows = await listEnabledDiscounts(ctx.db);
	const familyRow =
		enabledRows.find((row) => row.appliesToAnnual || row.appliesToLifetime) ?? null;
	const lifetimeRow = enabledRows.find((row) => row.appliesToLifetime) ?? null;

	const familyRate = familyRow ? familyDiscountRate(input.familyMemberCount) : 0;
	let lifetimeRate = 0;
	if (lifetimeRow) {
		const heldIds = (await listUserDiscounts(ctx.db, actor.id)).map((held) => held.discountId);
		lifetimeRate = lifetimeDiscountRate(
			lifetimeRow.discountRate,
			holdsLifetimeDiscount(enabledRows, heldIds)
		);
	}

	const quote = checkoutQuote({
		plan: input.plan,
		basePrice: PLAN_PRICES[input.plan],
		familyRate,
		lifetimeRate
	});
	const appliedDiscounts = quote.lines.flatMap((line) => {
		const row = line.source === 'family' ? familyRow : lifetimeRow;
		if (!row) return [];
		return [
			{ discountId: row.id, name: row.name, percentage: line.percentage, amount: line.amount }
		];
	});

	return { ...quote, appliedDiscounts };
}

/** The discounts this person qualifies for, with the legacy descriptions. */
export async function listEligibleDiscounts(
	ctx: Ctx,
	actor: Actor,
	input: { readonly familyMemberCount: number }
): Promise<EligibleDiscount[]> {
	const enabledRows = await listEnabledDiscounts(ctx.db);
	const lifetimeRow = enabledRows.find((row) => row.appliesToLifetime) ?? null;
	const familyRate = familyDiscountRate(input.familyMemberCount);
	const eligible: EligibleDiscount[] = [];

	if (familyRate > 0) {
		eligible.push({
			eligible: true,
			discountType: 'family_size',
			percentage: familyRate,
			description: 'Family member discount (5+ members)'
		});
	}

	if (lifetimeRow) {
		const heldIds = (await listUserDiscounts(ctx.db, actor.id)).map((held) => held.discountId);
		eligible.push({
			eligible: true,
			discountType: 'lifetime',
			percentage: lifetimeDiscountRate(
				lifetimeRow.discountRate,
				holdsLifetimeDiscount(enabledRows, heldIds)
			),
			description: 'Lifetime subscriber discount'
		});
	}

	return eligible;
}

/** Claim one discount for the caller; a repeated claim is a no-op with the legacy copy. */
export async function applyUserDiscount(
	ctx: Ctx,
	actor: Actor,
	discountId: string
): Promise<DiscountApplication> {
	const held = await listUserDiscounts(ctx.db, actor.id);
	if (held.some((row) => row.discountId === discountId)) {
		return { applied: false, message: 'Discount already applied' };
	}

	await insertUserDiscount(ctx.db, {
		userId: actor.id,
		discountId,
		now: ctx.clock.now()
	});
	return { applied: true, message: 'Discount applied successfully' };
}

/** The `pricing_view` event: one structured log line, no analytics service. */
export function recordPlanView(ctx: Ctx, actor: Actor, planType: string): void {
	ctx.log.info('pricing_view', { userId: actor.id, planType });
}

/**
 * Write the six tiers and two discounts, keeping existing ids untouched, so a
 * second cold start changes nothing. APP-01 decides whether the app seeds at
 * boot or lazily on first read; this has no caller yet.
 */
export async function ensureBillingDefaults(ctx: Ctx): Promise<void> {
	const now = ctx.clock.now();
	await withTx(ctx, async (txCtx) => {
		await insertTiersIfAbsent(txCtx.db, BILLING_TIERS, now);
		await insertDiscountsIfAbsent(txCtx.db, BILLING_DISCOUNTS, now);
	});
}

/**
 * Delete a person's subscription rows: the account deletion service calls this
 * with its transaction's ctx, before the person row goes (the only user FK
 * without a cascade). Only the person themselves, or an admin, may ask.
 */
export async function deleteSubscriptionsForPerson(
	ctx: Ctx,
	actor: Actor,
	input: { readonly personId: string }
): Promise<void> {
	if (actor.id !== input.personId && !actor.isAdmin) throw forbidden();
	await deleteSubscriptionsByUserId(ctx.db, input.personId);
}

async function readPlanLimits(db: Db, personId: string, now: Date): Promise<PlanLimits> {
	const row = await findActiveSubscription(db, personId, now);
	const tier = row?.subscriptionTypeId ? await findTier(db, row.subscriptionTypeId) : null;
	return resolvePlanLimits(row, tier);
}

async function readAiAllowance(ctx: Ctx, personId: string, now: Date): Promise<AiUsage> {
	const limits = await readPlanLimits(ctx.db, personId, now);
	const usage = await findAiUsage(ctx.db, personId, aiPeriod(now));
	return aiAllowance(usage?.aiEventCreationsUsed ?? 0, limits.aiEventCreationsPerMonth);
}

/** The legacy seed's six tiers, verbatim: free plus two individual and three family plans. */
const BILLING_TIERS = [
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
	}
];

/** The legacy seed's two discounts: lifetime 20% and family member 40%. */
const BILLING_DISCOUNTS = [
	{
		id: 'lifetime-discount',
		name: 'Lifetime Discount',
		description: '20% off lifetime plan when upgrading from annual',
		eligibleRole: 'annual_subscriber',
		discountRate: 20,
		durationMonths: 999,
		appliesToMonthly: false,
		appliesToAnnual: false,
		appliesToLifetime: true,
		stackable: false,
		enabled: true
	},
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
	}
];
