import type { PageServerLoad } from './$types';
import { getUserEligibleDiscounts, getBasePrice, getPlanPricing, type PlanType } from '$lib/server/services/checkoutService';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	let userDiscounts: {
		eligible: boolean;
		discountType: string;
		percentage: number;
		description: string;
	}[] = [];
	let showDiscountedPrices = false;

	if (user) {
		userDiscounts = await getUserEligibleDiscounts(user.id);
		showDiscountedPrices = userDiscounts.some(d => d.eligible);
	}

	const plans: {
		type: PlanType;
		name: string;
		basePrice: number;
		displayPrice: number;
		billingPeriod: string;
		badge?: string;
	}[] = [
		{
			type: 'monthly',
			name: 'Family Master',
			basePrice: getBasePrice('monthly'),
			displayPrice: getBasePrice('monthly'),
			billingPeriod: '/month'
		},
		{
			type: 'annual',
			name: 'Family Master',
			basePrice: getBasePrice('annual'),
			displayPrice: getBasePrice('annual'),
			billingPeriod: '/year'
		},
		{
			type: 'lifetime',
			name: 'Family Master Lifetime',
			basePrice: getBasePrice('lifetime'),
			displayPrice: getBasePrice('lifetime'),
			billingPeriod: ' one-time'
		}
	];

	if (user && showDiscountedPrices) {
		for (const plan of plans) {
			const pricing = await import('$lib/server/services/checkoutService').then(m =>
				m.calculateCheckoutPrice(user.id, plan.type)
			);
			plan.displayPrice = pricing.finalPrice;
		}
	}

	return {
		user: user ? { id: user.id, email: user.email } : null,
		isLoggedIn: !!user,
		userDiscounts,
		showDiscountedPrices,
		plans,
		pricing: getPlanPricing('monthly')
	};
};
