import { db } from '$lib/server/db';
import { discounts, userDiscounts, subscriptions } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { calculateFamilyMemberDiscount, calculateLifetimeDiscount, type DiscountResult } from './discountService';

export interface CheckoutDiscountResult {
	originalPrice: number;
	discountAmount: number;
	finalPrice: number;
	appliedDiscounts: AppliedDiscount[];
}

export interface AppliedDiscount {
	discountId: string;
	name: string;
	percentage: number;
	amount: number;
}

export type PlanType = 'monthly' | 'annual' | 'lifetime';

const BASE_PRICES: Record<PlanType, number> = {
	monthly: 9,
	annual: 90,
	lifetime: 150
};

export async function calculateCheckoutPrice(
	userId: string,
	planType: PlanType,
	basePrice?: number
): Promise<CheckoutDiscountResult> {
	const originalPrice = basePrice ?? BASE_PRICES[planType];
	const appliedDiscounts: AppliedDiscount[] = [];
	let totalDiscountPercentage = 0;

	const [familyDiscount, lifetimeDiscount] = await Promise.all([
		calculateFamilyMemberDiscount(userId),
		calculateLifetimeDiscount(userId)
	]);

	const familyEligible = familyDiscount.eligible && (planType === 'annual' || planType === 'lifetime');
	const lifetimeEligible = lifetimeDiscount.eligible && planType === 'lifetime';

	if (familyEligible && familyDiscount.discountPercentage > 0) {
		const discountInfo = await getDiscountByType('family_size');
		if (discountInfo) {
			appliedDiscounts.push({
				discountId: discountInfo.id,
				name: discountInfo.name,
				percentage: familyDiscount.discountPercentage,
				amount: Math.round(originalPrice * (familyDiscount.discountPercentage / 100) * 100) / 100
			});
			totalDiscountPercentage += familyDiscount.discountPercentage;
		}
	}

	if (lifetimeEligible && lifetimeDiscount.discountPercentage > 0) {
		const discountInfo = await getDiscountByType('lifetime');
		if (discountInfo) {
			appliedDiscounts.push({
				discountId: discountInfo.id,
				name: discountInfo.name,
				percentage: lifetimeDiscount.discountPercentage,
				amount: Math.round(originalPrice * (lifetimeDiscount.discountPercentage / 100) * 100) / 100
			});
			totalDiscountPercentage += lifetimeDiscount.discountPercentage;
		}
	}

	if (totalDiscountPercentage > 100) {
		totalDiscountPercentage = 100;
	}

	const discountAmount = Math.round(originalPrice * (totalDiscountPercentage / 100) * 100) / 100;
	const finalPrice = Math.max(0, originalPrice - discountAmount);

	return {
		originalPrice,
		discountAmount,
		finalPrice,
		appliedDiscounts
	};
}

async function getDiscountByType(discountType: string) {
	const discountList = await db
		.select()
		.from(discounts)
		.where(eq(discounts.enabled, true))
		.limit(10);

	if (discountType === 'family_size') {
		return discountList.find(d => d.appliesToAnnual === true || d.appliesToLifetime === true);
	}

	if (discountType === 'lifetime') {
		return discountList.find(d => d.appliesToLifetime === true);
	}

	return discountList[0] ?? null;
}

export async function applyDiscountToSubscription(
	userId: string,
	subscriptionId: string,
	discountIds: string[]
): Promise<void> {
	for (const discountId of discountIds) {
		const [existing] = await db
			.select()
			.from(userDiscounts)
			.where(
				and(
					eq(userDiscounts.userId, userId),
					eq(userDiscounts.discountId, discountId)
				)
			)
			.limit(1);

		if (!existing) {
			await db.insert(userDiscounts).values({
				userId,
				discountId,
				appliedAt: new Date()
			});
		}
	}

	await db
		.update(subscriptions)
		.set({
			updatedAt: new Date()
		})
		.where(eq(subscriptions.id, subscriptionId));
}

export async function getUserEligibleDiscounts(userId: string): Promise<{
	eligible: boolean;
	discountType: string;
	percentage: number;
	description: string;
}[]> {
	const eligibleDiscounts: {
		eligible: boolean;
		discountType: string;
		percentage: number;
		description: string;
	}[] = [];

	const [familyDiscount, lifetimeDiscount] = await Promise.all([
		calculateFamilyMemberDiscount(userId),
		calculateLifetimeDiscount(userId)
	]);

	if (familyDiscount.eligible) {
		eligibleDiscounts.push({
			eligible: true,
			discountType: 'family_size',
			percentage: familyDiscount.discountPercentage,
			description: 'Family member discount (5+ members)'
		});
	}

	if (lifetimeDiscount.eligible) {
		eligibleDiscounts.push({
			eligible: true,
			discountType: 'lifetime',
			percentage: lifetimeDiscount.discountPercentage,
			description: 'Lifetime subscriber discount'
		});
	}

	return eligibleDiscounts;
}

export function getBasePrice(planType: PlanType): number {
	return BASE_PRICES[planType];
}

export function getPlanPricing(planType: PlanType): {
	monthly: number;
	annual: number;
	lifetime: number;
	monthlyEquivalent: number;
} {
	const monthlyPrice = BASE_PRICES.monthly;
	const annualPrice = BASE_PRICES.annual;
	const lifetimePrice = BASE_PRICES.lifetime;
	const monthlyEquivalent = annualPrice / 12;

	return {
		monthly: monthlyPrice,
		annual: annualPrice,
		lifetime: lifetimePrice,
		monthlyEquivalent
	};
}
