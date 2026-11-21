/**
 * billing — public isomorphic interface: contract types, pure rules, client api.
 * Other modules import billing ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export type {
	AiUsage,
	AiUsagePeriod,
	CheckoutPlanInput,
	PlanLimits,
	PlanPricing,
	PlanTier,
	PlanType,
	SubscriptionSummary,
	SubscriptionWindow
} from './billing.contract';
export {
	archiveRefusal,
	attachmentRefusal,
	exportImportRefusal,
	familyCreationRefusal,
	FREE_PLAN_LIMITS,
	isUnlimitedLimit,
	memberLimitRefusal,
	resolvePlanLimits,
	retentionRefusal
} from './billing.limits.rules';
export { aiAllowance, aiLimitRefusal, isPaidTier } from './billing.ai.rules';
export {
	checkoutQuote,
	familyDiscountRate,
	holdsLifetimeDiscount,
	isPlanType,
	lifetimeDiscountRate,
	PLAN_PRICES,
	PLAN_TYPES,
	planPricing,
	planTypeOrDefault
} from './billing.pricing.rules';
export { fetchSubscriptionSummary } from './billing.api';
