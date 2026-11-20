/**
 * billing pricing rules: the three plans and their base prices, the two
 * discount rates and the checkout quote. Pure: percentages, money and the
 * membership count arrive as arguments; the discount rows and the count come
 * from the repo and the caller.
 *
 * The checkout is still a stub, so nothing here charges anyone; it computes
 * what the checkout page and the purchase action report.
 *
 * Doc: ./README.md#invariants
 */
import type { PlanPricing } from './billing.contract';

/** The three plans a person can buy, in wire order. */
export const PLAN_TYPES = ['monthly', 'annual', 'lifetime'] as const;

/** One plan's price cadence; the checkout input and the pricing card use it. */
export type PlanType = (typeof PLAN_TYPES)[number];

/** Base prices before discounts: 9 a month, 90 a year, 150 once. */
export const PLAN_PRICES: Readonly<Record<PlanType, number>> = {
	monthly: 9,
	annual: 90,
	lifetime: 150
};

/** Case-sensitive: `Monthly` is not a plan, and must not be folded into one. */
export function isPlanType(value: unknown): value is PlanType {
	return typeof value === 'string' && PLAN_TYPES.some((plan) => plan === value);
}

/** `?plan` coercion: an absent or unknown value is the monthly plan. */
export function planTypeOrDefault(value: unknown): PlanType {
	return isPlanType(value) ? value : 'monthly';
}

/** The three base prices plus the annual plan's monthly equivalent (90 / 12 = 7.5). */
export function planPricing(): PlanPricing {
	return {
		monthly: PLAN_PRICES.monthly,
		annual: PLAN_PRICES.annual,
		lifetime: PLAN_PRICES.lifetime,
		monthlyEquivalent: PLAN_PRICES.annual / 12
	};
}

/**
 * The family-size discount: 40% from four memberships up (`>= 4`), today's
 * legacy rule, which its own copy described as "5+ members". The count is the
 * caller's. Q-017 (owner, B) decided the post-S6 fix: count the members of one
 * family and start at five; that fix changes this rule's tests, so S3+S4 keep it.
 * The 40 is a literal: the family discount row's `discountRate` is never read.
 */
export function familyDiscountRate(membershipCount: number): number {
	return membershipCount >= 4 ? 40 : 0;
}

/** A discount row as far as "does this person hold the lifetime discount" reads it. */
export type LifetimeDiscountCandidate = {
	readonly id: string;
	readonly enabled: boolean;
	readonly appliesToLifetime: boolean;
};

/**
 * Whether the person has claimed an enabled lifetime discount: one of their
 * claimed ids is a row that is enabled and applies to lifetime. Legacy
 * quirk kept: a claim's own `expiresAt` is never read, so an expired claim
 * still counts.
 */
export function holdsLifetimeDiscount(
	discounts: readonly LifetimeDiscountCandidate[],
	heldDiscountIds: readonly string[]
): boolean {
	return discounts.some(
		(discount) =>
			discount.enabled && discount.appliesToLifetime && heldDiscountIds.includes(discount.id)
	);
}

/**
 * The lifetime discount: 20% when the person already holds an enabled lifetime
 * discount (`holdsLifetimeDiscount`), otherwise the configured row's rate. The
 * 20 is a literal, like the family 40: only an unheld person's rate comes from
 * the row. Eligibility itself (an enabled lifetime row exists) is the caller's read.
 */
export function lifetimeDiscountRate(configuredRate: number, holdsDiscount: boolean): number {
	return holdsDiscount ? 20 : configuredRate;
}

/** One discount line the checkout page shows; `source` picks its repo row. */
export type CheckoutLine = {
	readonly source: 'family' | 'lifetime';
	readonly percentage: number;
	readonly amount: number;
};

/** What one plan costs after its eligible discounts, before the stub refuses to sell. */
export type CheckoutQuote = {
	readonly originalPrice: number;
	readonly discountPercentage: number;
	readonly discountAmount: number;
	readonly finalPrice: number;
	readonly lines: readonly CheckoutLine[];
};

/**
 * The checkout arithmetic: the family discount applies to annual and lifetime,
 * the lifetime discount to lifetime only; the percentages sum and cap at 100;
 * the amount is rounded to cents per line and in total, and the final price
 * never goes below zero.
 */
export function checkoutQuote(input: {
	readonly plan: PlanType;
	readonly basePrice: number;
	readonly familyRate: number;
	readonly lifetimeRate: number;
}): CheckoutQuote {
	const lines: CheckoutLine[] = [];

	if ((input.plan === 'annual' || input.plan === 'lifetime') && input.familyRate > 0) {
		lines.push({
			source: 'family',
			percentage: input.familyRate,
			amount: roundToCents(input.basePrice * (input.familyRate / 100))
		});
	}

	if (input.plan === 'lifetime' && input.lifetimeRate > 0) {
		lines.push({
			source: 'lifetime',
			percentage: input.lifetimeRate,
			amount: roundToCents(input.basePrice * (input.lifetimeRate / 100))
		});
	}

	const summedPercentage = lines.reduce((sum, line) => sum + line.percentage, 0);
	const discountPercentage = Math.min(100, summedPercentage);
	const discountAmount = roundToCents(input.basePrice * (discountPercentage / 100));

	return {
		originalPrice: input.basePrice,
		discountPercentage,
		discountAmount,
		finalPrice: Math.max(0, input.basePrice - discountAmount),
		lines
	};
}

/** The legacy `Math.round(value * 100) / 100`: money is reported in whole cents. */
function roundToCents(value: number): number {
	return Math.round(value * 100) / 100;
}
