import type { PageServerLoad } from './$types';
import { getBasePrice, getPlanPricing, type PlanType } from '$lib/server/services/checkoutService';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	const userDiscounts: {
		eligible: boolean;
		discountType: string;
		percentage: number;
		description: string;
	}[] = [];
	const showDiscountedPrices = false;

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

	return {
		user: user ? { id: user.id, email: user.email } : null,
		isLoggedIn: !!user,
		userDiscounts,
		showDiscountedPrices,
		plans,
		pricing: getPlanPricing('monthly')
	};
};