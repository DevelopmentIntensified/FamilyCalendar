/**
 * marketing pricing rules: the three pricing cards' copy, the FAQ block and the
 * two checkout strings (`/pricing` and `/checkout` are this module's pages
 * since the wave decision; billing owns the prices and the discounts).
 *
 * The free card's member line is built from the limit the caller passes — the
 * page hands in billing's `FREE_PLAN_LIMITS.memberLimit` — so marketing never
 * restates a live plan limit (Q-018 answer B: six, while the legacy copy said
 * five). The paid cards' figures come from billing's `PLAN_PRICES` (the page's
 * 9 and 150); the checkout quote itself is billing's services, never this file.
 *
 * The checkout is still a stub: the plan's name, its period label and the
 * three sentences the load/action answer are the whole rule set, and nothing
 * here charges anyone.
 *
 * Doc: ./README.md#invariants
 */
import { PLAN_PRICES, type PlanType } from '$lib/domains/billing/index';

/** One card's colour treatment; the legacy `PricingCard` prop had exactly these three. */
export type PricingAccent = 'plain' | 'primary' | 'amber';

/** One pricing card, ready to spread into the card component. */
export type PricingTier = {
	readonly name: string;
	readonly blurb: string;
	readonly price: string;
	readonly per: string;
	readonly features: readonly string[];
	readonly ctaLabel: string;
	readonly badge: string | null;
	readonly note: string | null;
	readonly accent: PricingAccent;
};

/** One FAQ row of the block under the cards. */
export type PricingFaq = { readonly q: string; readonly a: string };

/** The `/checkout` selected plan as the page prints it. */
export type CheckoutPlanView = {
	readonly type: PlanType;
	readonly name: string;
	readonly price: number;
};

/**
 * The three cards in wire order (Free, Family, Lifetime), copy verbatim from
 * the legacy page. `memberLimit` is the plan policy's number; the free card's
 * member line is the only data-driven string on the page.
 */
export function pricingTiers(memberLimit: number): readonly PricingTier[] {
	return [
		{
			name: 'Free',
			blurb: 'Perfect for small families getting started',
			price: '$0',
			per: '/month',
			features: [
				'1 family calendar',
				`Up to ${memberLimit} family members`,
				'Smart paste event import',
				'RSVP to family events',
				'10 smart algorithm event creations/month',
				'Print your family calendar'
			],
			ctaLabel: 'Start Free',
			badge: null,
			note: null,
			accent: 'plain'
		},
		{
			name: 'Family',
			blurb: 'For families who want it all',
			price: `$${PLAN_PRICES.monthly}`,
			per: '/month',
			features: [
				'Everything in Free',
				'Unlimited family members',
				'Unlimited calendars (kids, sports, work)',
				'Extra smart paste capacity',
				'Full event history & search',
				'Priority family support'
			],
			ctaLabel: 'Start Free Trial',
			badge: 'Most Popular',
			note: null,
			accent: 'primary'
		},
		{
			name: 'Lifetime',
			blurb: 'One payment, forever access',
			price: `$${PLAN_PRICES.lifetime}`,
			per: 'one-time',
			features: [
				'All Family features, forever',
				'Never pay monthly again',
				'Future features included',
				'Founding member badge'
			],
			ctaLabel: 'Get Lifetime Access',
			badge: 'Limited Offer',
			note: 'Less than $1/month over 10 years',
			accent: 'amber'
		}
	];
}

/** The four FAQ rows under the cards, verbatim. */
export const PRICING_FAQS: readonly PricingFaq[] = [
	{
		q: 'What counts as a "family member"?',
		a: "Anyone you invite to your family calendar—your spouse, kids, grandparents, babysitters, or caregivers. You control who's in."
	},
	{
		q: 'Can I try Family Planz before paying?',
		a: 'Absolutely! Our Free plan is free forever for small families. Upgrade anytime when you need more.'
	},
	{
		q: 'What happens if I cancel?',
		a: 'Your family keeps access until the end of your billing period. Your data is always yours to export.'
	},
	{
		q: "Is my family's data safe?",
		a: "Yes. We use encryption, secure sessions, and never share your family's data with third parties."
	}
];

/** Where an anonymous checkout visitor is sent, carrying the way back (legacy exact). */
export const CHECKOUT_LOGIN_REDIRECT = '/login?redirect=/checkout';

/** The action's answer when the caller has no session (the legacy defensive branch). */
export const CHECKOUT_NOT_AUTHENTICATED_MESSAGE = 'Not authenticated';

/** The action's answer when the posted plan or price cannot be read (legacy exact). */
export const CHECKOUT_INVALID_MESSAGE = 'Invalid purchase data';

/** The stub's answer while no payment provider is wired (legacy exact). */
export const CHECKOUT_STUB_MESSAGE = 'Checkout is not yet available.';

/** The lifetime plan's name on the checkout card; every other plan is `Family Master`. */
export function checkoutPlanName(plan: PlanType): string {
	return plan === 'lifetime' ? 'Family Master Lifetime' : 'Family Master';
}

/**
 * The member count Q-017 (owner, B) says the family discount reads: the
 * members of one family, the fullest one when the person belongs to several —
 * never the person's membership rows (the legacy rule counted those).
 */
export function fullestFamilyMemberCount(families: readonly { readonly memberCount: number }[]): number {
	let fullest = 0;
	for (const family of families) {
		if (family.memberCount > fullest) fullest = family.memberCount;
	}
	return fullest;
}
