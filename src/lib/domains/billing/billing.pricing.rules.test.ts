/**
 * Pure pricing rules: the plan vocabulary, the base prices, the two discount
 * rates and the checkout arithmetic. Expected values come from the README
 * Invariants and the legacy services they cite (`checkoutService.ts`,
 * `discountService.ts`), never from running the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { CheckoutQuote } from './billing.pricing.rules';
import {
	checkoutQuote,
	familyDiscountRate,
	isPlanType,
	lifetimeDiscountRate,
	PLAN_PRICES,
	PLAN_TYPES,
	planPricing,
	planTypeOrDefault,
	type PlanType
} from './billing.pricing.rules';

type QuoteInput = {
	readonly plan: PlanType;
	readonly basePrice: number;
	readonly familyRate: number;
	readonly lifetimeRate: number;
};

describe('the plan vocabulary and base prices', () => {
	it('lists the three plans in wire order', () => {
		expect(PLAN_TYPES).toEqual(['monthly', 'annual', 'lifetime']);
	});

	it('prices the three plans and the annual month', () => {
		expect(PLAN_PRICES).toEqual({ monthly: 9, annual: 90, lifetime: 150 });
		expect(planPricing()).toEqual({ monthly: 9, annual: 90, lifetime: 150, monthlyEquivalent: 7.5 });
	});

	it.each<[unknown, boolean]>([
		['monthly', true],
		['annual', true],
		['lifetime', true],
		['Monthly', false],
		['yearly', false],
		['', false],
		[1, false],
		[null, false],
		[undefined, false]
	])('isPlanType(%j) → %s', (value, expected) => {
		expect(isPlanType(value)).toBe(expected);
	});

	it.each<[unknown, PlanType]>([
		['monthly', 'monthly'],
		['annual', 'annual'],
		['lifetime', 'lifetime'],
		['yearly', 'monthly'],
		['Monthly', 'monthly'],
		['', 'monthly'],
		[42, 'monthly'],
		[null, 'monthly'],
		[undefined, 'monthly']
	])('planTypeOrDefault(%j) → %s', (value, expected) => {
		expect(planTypeOrDefault(value)).toBe(expected);
	});
});

describe('familyDiscountRate', () => {
	it.each<[number, number]>([
		[0, 0],
		[3, 0],
		[4, 40],
		[5, 40],
		[12, 40]
	])('family discount is 40% from four memberships up: %i → %i%%', (membershipCount, expected) => {
		expect(familyDiscountRate(membershipCount)).toBe(expected);
	});
});

describe('lifetimeDiscountRate', () => {
	it.each<[number, boolean, number]>([
		[20, false, 20],
		[40, false, 40],
		[0, false, 0],
		[40, true, 20],
		[10, true, 20],
		[0, true, 20]
	])('lifetime discount, held and unheld: %i%%, holds %s → %i%%', (rate, holds, expected) => {
		expect(lifetimeDiscountRate(rate, holds)).toBe(expected);
	});
});

describe('checkoutQuote', () => {
	it.each<[string, QuoteInput, CheckoutQuote]>([
		[
			'monthly offers neither discount',
			{ plan: 'monthly', basePrice: 9, familyRate: 40, lifetimeRate: 20 },
			{
				originalPrice: 9,
				discountPercentage: 0,
				discountAmount: 0,
				finalPrice: 9,
				lines: []
			}
		],
		[
			'annual takes the family discount only',
			{ plan: 'annual', basePrice: 90, familyRate: 40, lifetimeRate: 20 },
			{
				originalPrice: 90,
				discountPercentage: 40,
				discountAmount: 36,
				finalPrice: 54,
				lines: [{ source: 'family', percentage: 40, amount: 36 }]
			}
		],
		[
			'lifetime stacks family and lifetime',
			{ plan: 'lifetime', basePrice: 150, familyRate: 40, lifetimeRate: 20 },
			{
				originalPrice: 150,
				discountPercentage: 60,
				discountAmount: 90,
				finalPrice: 60,
				lines: [
					{ source: 'family', percentage: 40, amount: 60 },
					{ source: 'lifetime', percentage: 20, amount: 30 }
				]
			}
		],
		[
			'caps stacked percentages at 100 and never goes negative',
			{ plan: 'lifetime', basePrice: 150, familyRate: 40, lifetimeRate: 80 },
			{
				originalPrice: 150,
				discountPercentage: 100,
				discountAmount: 150,
				finalPrice: 0,
				lines: [
					{ source: 'family', percentage: 40, amount: 60 },
					{ source: 'lifetime', percentage: 80, amount: 120 }
				]
			}
		],
		[
			'a zero family rate adds no line',
			{ plan: 'annual', basePrice: 90, familyRate: 0, lifetimeRate: 20 },
			{
				originalPrice: 90,
				discountPercentage: 0,
				discountAmount: 0,
				finalPrice: 90,
				lines: []
			}
		],
		[
			'a zero lifetime rate adds no line',
			{ plan: 'lifetime', basePrice: 150, familyRate: 0, lifetimeRate: 0 },
			{
				originalPrice: 150,
				discountPercentage: 0,
				discountAmount: 0,
				finalPrice: 150,
				lines: []
			}
		],
		[
			'applies a percentage to the given base price',
			{ plan: 'annual', basePrice: 100, familyRate: 33, lifetimeRate: 0 },
			{
				originalPrice: 100,
				discountPercentage: 33,
				discountAmount: 33,
				finalPrice: 67,
				lines: [{ source: 'family', percentage: 33, amount: 33 }]
			}
		]
	])('sums discounts, caps at 100, never goes negative — %s', (_label, input, expected) => {
		expect(checkoutQuote(input)).toEqual(expected);
	});
});
