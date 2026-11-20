/**
 * billing contract: the zod schemas and types for the plan card's wire body
 * (`GET /api/me/subscription`) and the checkout plan input. Dates on the wire
 * are ISO strings, which is what the golden (`billing.http.db.test.ts`) pins;
 * server-side rows with real `Date`s live at the bottom and never reach the
 * wire directly.
 *
 * The plan vocabulary lives in `billing.pricing.rules.ts` (a closed set is a
 * rule); this file re-exports its type and parses with it, so there is one home
 * for the three plans.
 *
 * Doc: ./README.md#invariants
 */
import { isoInstant, z } from '$lib/kernel/validation/validators';
import { planTypeOrDefault, type PlanType } from './billing.pricing.rules';

/** One plan's price cadence (`monthly`, `annual`, `lifetime`). */
export type { PlanType };

// --- Plan policy ------------------------------------------------------------

/**
 * The plan's limits: one shape for the wire, the policy read and every
 * refusal, so a limit cannot fork into two spellings.
 */
export const PlanLimits = z.object({
	familyLimit: z.number().int(),
	memberLimit: z.number().int(),
	retentionViewDays: z.number().int(),
	archivedRetentionDays: z.number().int(),
	attachmentLimitBytes: z.number().int(),
	aiEventCreationsPerMonth: z.number().int(),
	exportImportEnabled: z.boolean()
});
export type PlanLimits = z.infer<typeof PlanLimits>;

/** One AI-usage period as the plan card reports it; `remaining` never goes below 0. */
export const AiUsage = z.object({
	used: z.number().int(),
	limit: z.number().int(),
	remaining: z.number().int()
});
export type AiUsage = z.infer<typeof AiUsage>;

/** The three base prices plus the annual plan's monthly equivalent (annual / 12). */
export const PlanPricing = z.object({
	monthly: z.number(),
	annual: z.number(),
	lifetime: z.number(),
	monthlyEquivalent: z.number()
});
export type PlanPricing = z.infer<typeof PlanPricing>;

// --- The plan card's wire body ---------------------------------------------

/** One subscription tier as the wire carries it: the whole `subscriptionTypes` row. */
export const PlanTier = z.object({
	id: z.string(),
	name: z.string(),
	tierName: z.string(),
	planType: z.string(),
	displayName: z.string(),
	createdAt: isoInstant(),
	updatedAt: isoInstant(),
	durationMonths: z.number().int(),
	enabled: z.boolean(),
	familyLimit: z.number().int(),
	memberLimit: z.number().int(),
	retentionViewDays: z.number().int(),
	archivedRetentionDays: z.number().int(),
	attachmentLimitBytes: z.number().int(),
	aiEventCreationsPerMonth: z.number().int(),
	exportImportEnabled: z.boolean()
});
export type PlanTier = z.infer<typeof PlanTier>;

/** The active subscription window as the plan card reports it. */
export const SubscriptionWindow = z.object({
	id: z.string(),
	startDate: isoInstant(),
	endDate: isoInstant(),
	createdAt: isoInstant()
});
export type SubscriptionWindow = z.infer<typeof SubscriptionWindow>;

/**
 * `200` body of `GET /api/me/subscription`: the active row and its tier, the
 * resolved limits, this month's AI counter and the base prices. A read failure
 * degrades to `{ tier: null, subscription: null }` + the free limits, never an
 * error status (the golden pins both paths).
 */
export const SubscriptionSummary = z.object({
	subscription: z.object({
		tier: PlanTier.nullable(),
		subscription: SubscriptionWindow.nullable()
	}),
	planLimits: PlanLimits,
	aiUsage: AiUsage,
	planPricing: PlanPricing
});
export type SubscriptionSummary = z.infer<typeof SubscriptionSummary>;

// --- Checkout ---------------------------------------------------------------

/**
 * `?plan` on `/checkout`: an absent, null or unrecognized value is the monthly
 * plan, so a checkout URL never 400s (the legacy page coerced it the same way).
 * One transform, so there is no second validation whose message could fire.
 */
export const CheckoutPlanInput = z.object({
	// `.optional()` first: in zod 4 a bare `z.unknown()` key is required, so an
	// absent `?plan` would 400 instead of defaulting.
	plan: z.unknown().optional().transform(planTypeOrDefault)
});
export type CheckoutPlanInput = z.infer<typeof CheckoutPlanInput>;

// --- Server-side row shapes ------------------------------------------------

/** The AI counter's identity: one row per person, month and calendar year (UTC). */
export type AiUsagePeriod = { readonly month: number; readonly year: number };

/**
 * What the repo and the service pass around: the same tier row with real
 * `Date`s. Never sent directly — the endpoint builder's `ok()` serialises the
 * dates and `SubscriptionSummary` describes the resulting JSON.
 */
export type PlanTierView = {
	readonly id: string;
	readonly name: string;
	readonly tierName: string;
	readonly planType: string;
	readonly displayName: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly durationMonths: number;
	readonly enabled: boolean;
	readonly familyLimit: number;
	readonly memberLimit: number;
	readonly retentionViewDays: number;
	readonly archivedRetentionDays: number;
	readonly attachmentLimitBytes: number;
	readonly aiEventCreationsPerMonth: number;
	readonly exportImportEnabled: boolean;
};

/** The active window with real `Date`s (the wire's `SubscriptionWindow`). */
export type SubscriptionWindowView = {
	readonly id: string;
	readonly startDate: Date;
	readonly endDate: Date;
	readonly createdAt: Date;
};

/**
 * The active row's plan columns: the window plus the five override columns
 * `resolvePlanLimits` merges over the tier. Structurally a `subscriptions` row.
 */
export type PlanSubscription = SubscriptionWindowView & {
	readonly familyLimitOverride: number | null;
	readonly memberLimitOverride: number | null;
	readonly retentionViewDaysOverride: number | null;
	readonly archivedRetentionDaysOverride: number | null;
	readonly attachmentLimitBytesOverride: number | null;
};

/** The plan card's read model before `ok()` serialises it (dates are `Date`s). */
export type SubscriptionSummaryView = {
	readonly subscription: {
		readonly tier: PlanTierView | null;
		readonly subscription: SubscriptionWindowView | null;
	};
	readonly planLimits: PlanLimits;
	readonly aiUsage: AiUsage;
	readonly planPricing: PlanPricing;
};
