import { db } from '$lib/server/db';
import { discounts, userDiscounts, familyMembers } from '$lib/server/db/schema';
import { eq, sql, and, or } from 'drizzle-orm';

export interface DiscountBreakdown {
	discountType: string;
	percentage: number;
	description: string;
	stackable: boolean;
}

export interface DiscountResult {
	totalDiscount: number;
	breakdown: DiscountBreakdown[];
	eligibleForAnnual: boolean;
	eligibleForLifetime: boolean;
}

export async function calculateFamilyMemberDiscount(
	userId: string
): Promise<{ eligible: boolean; discountPercentage: number }> {
	const familyMembersResult = await db
		.select({ userId: familyMembers.userId, familyId: familyMembers.familyId })
		.from(familyMembers)
		.where(eq(familyMembers.userId, userId));

	const memberCount = familyMembersResult.length;

	if (memberCount >= 4) {
		return { eligible: true, discountPercentage: 40 };
	}

	return { eligible: false, discountPercentage: 0 };
}

export async function calculateLifetimeDiscount(
	userId: string
): Promise<{ eligible: boolean; discountPercentage: number }> {
	const lifetimeDiscount = await db
		.select()
		.from(discounts)
		.where(and(eq(discounts.enabled, true), eq(discounts.appliesToLifetime, true)))
		.limit(1);

	if (lifetimeDiscount.length === 0) {
		return { eligible: false, discountPercentage: 0 };
	}

	const userDiscount = await db
		.select()
		.from(userDiscounts)
		.where(eq(userDiscounts.userId, userId));

	if (userDiscount.length > 0) {
		const discountIds = userDiscount.map((ud) => ud.discountId);
		const hasLifetimeDiscount = await db
			.select()
			.from(discounts)
			.where(
				and(
					eq(discounts.enabled, true),
					eq(discounts.appliesToLifetime, true),
					sql`${discounts.id} IN ${discountIds}`
				)
			)
			.limit(1);

		if (hasLifetimeDiscount.length > 0) {
			return { eligible: true, discountPercentage: 20 };
		}
	}

	const [discount] = lifetimeDiscount;
	if (discount) {
		return { eligible: true, discountPercentage: Number(discount.discountRate) };
	}

	return { eligible: false, discountPercentage: 0 };
}

export async function calculateDiscounts(
	userId: string
): Promise<DiscountResult> {
	const breakdown: DiscountBreakdown[] = [];
	let totalDiscount = 0;
	let eligibleForAnnual = false;
	let eligibleForLifetime = false;

	const familyDiscount = await calculateFamilyMemberDiscount(userId);
	if (familyDiscount.eligible) {
		breakdown.push({
			discountType: 'family_size',
			percentage: familyDiscount.discountPercentage,
			description: 'Family member discount',
			stackable: true
		});
		totalDiscount += familyDiscount.discountPercentage;
		eligibleForAnnual = true;
	}

	const lifetimeDiscount = await calculateLifetimeDiscount(userId);
	if (lifetimeDiscount.eligible) {
		breakdown.push({
			discountType: 'lifetime',
			percentage: lifetimeDiscount.discountPercentage,
			description: 'Lifetime subscriber discount',
			stackable: true
		});
		totalDiscount += lifetimeDiscount.discountPercentage;
		eligibleForLifetime = true;
		if (lifetimeDiscount.discountPercentage > 0) {
			eligibleForAnnual = true;
		}
	}

	if (totalDiscount > 100) {
		totalDiscount = 100;
	}

	return {
		totalDiscount,
		breakdown,
		eligibleForAnnual,
		eligibleForLifetime
	};
}

export async function getAvailableDiscounts() {
	return await db.select().from(discounts).where(eq(discounts.enabled, true));
}

export async function applyDiscount(userId: string, discountId: string) {
	const [existing] = await db
		.select()
		.from(userDiscounts)
		.where(and(eq(userDiscounts.userId, userId), eq(userDiscounts.discountId, discountId)));

	if (existing) {
		return { applied: false, message: 'Discount already applied' };
	}

	await db.insert(userDiscounts).values({
		userId,
		discountId,
		appliedAt: new Date()
	});

	return { applied: true, message: 'Discount applied successfully' };
}