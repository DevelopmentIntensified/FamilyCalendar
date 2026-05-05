import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { calculateCheckoutPrice, getUserEligibleDiscounts, type PlanType } from '$lib/server/services/checkoutService';
import { getUserSubscription } from '$lib/server/services/subscriptionService';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;

	if (!user) {
		throw redirect(302, '/login?redirect=/checkout');
	}

	const url = event.url;
	const planTypeParam = url.searchParams.get('plan') as PlanType | null;
	const planType: PlanType = planTypeParam === 'annual' || planTypeParam === 'lifetime' || planTypeParam === 'monthly'
		? planTypeParam
		: 'monthly';

	const existingSubscription = await getUserSubscription(user.id);
	const isAlreadySubscribed = !!existingSubscription;

	const [checkoutResult, userDiscounts] = await Promise.all([
		calculateCheckoutPrice(user.id, planType),
		getUserEligibleDiscounts(user.id)
	]);

	const selectedPlan = {
		type: planType,
		name: planType === 'lifetime' ? 'Family Master Lifetime' : 'Family Master',
		price: checkoutResult.finalPrice
	};

	return {
		user: { id: user.id, email: user.email },
		isLoggedIn: true,
		isAlreadySubscribed,
		selectedPlan,
		checkoutResult,
		userDiscounts
	};
};

export const actions: Actions = {
	purchase: async (event) => {
		const user = event.locals.user;

		if (!user) {
			return { success: false, error: 'Not authenticated' };
		}

		const formData = await event.request.formData();
		const planType = formData.get('planType') as PlanType;
		const finalPrice = Number(formData.get('finalPrice') ?? 0);

		if (!planType || !finalPrice) {
			return { success: false, error: 'Invalid purchase data' };
		}

		return {
			success: false,
			message: 'Checkout is not yet available. Join the waitlist to get early access.'
		};
	}
};