/**
 * The `/pricing` cards and the `/checkout` strings. Expected values are the
 * legacy pages' copy and the owner's answers, never this module's output:
 * the free card's member line follows the limit argument (Q-018 B: six), and
 * the plan names are the legacy checkout load's.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	CHECKOUT_INVALID_MESSAGE,
	CHECKOUT_LOGIN_REDIRECT,
	CHECKOUT_NOT_AUTHENTICATED_MESSAGE,
	CHECKOUT_STUB_MESSAGE,
	PRICING_FAQS,
	checkoutPlanName,
	fullestFamilyMemberCount,
	pricingTiers
} from './marketing.pricing.rules';

describe('pricingTiers', () => {
	it('lists the three plans in wire order with the legacy prices and periods', () => {
		const tiers = pricingTiers(6);

		expect(tiers.map((tier) => tier.name)).toEqual(['Free', 'Family', 'Lifetime']);
		expect(tiers.map((tier) => tier.price)).toEqual(['$0', '$9', '$150']);
		expect(tiers.map((tier) => tier.per)).toEqual(['/month', '/month', 'one-time']);
		expect(tiers.map((tier) => tier.ctaLabel)).toEqual([
			'Start Free',
			'Start Free Trial',
			'Get Lifetime Access'
		]);
	});

	it('keeps the legacy colour treatments, badge and note', () => {
		const [free, family, lifetime] = pricingTiers(6);

		expect([free.accent, family.accent, lifetime.accent]).toEqual([
			'plain',
			'primary',
			'amber'
		]);
		expect([free.badge, family.badge, lifetime.badge]).toEqual([
			null,
			'Most Popular',
			'Limited Offer'
		]);
		expect([free.note, family.note, lifetime.note]).toEqual([
			null,
			null,
			'Less than $1/month over 10 years'
		]);
	});

	it('prints the free member line from the limit it is given, not a literal', () => {
		const six = pricingTiers(6)[0].features;
		const five = pricingTiers(5)[0].features;

		expect(six).toContain('Up to 6 family members');
		expect(six).not.toContain('Up to 5 family members');
		expect(five).toContain('Up to 5 family members');
		expect(six).toContain('1 family calendar');
		expect(six).toContain('10 smart algorithm event creations/month');
	});

	it('keeps the paid cards’ legacy feature lists', () => {
		const [, family, lifetime] = pricingTiers(6);

		expect(family.features).toContain('Unlimited family members');
		expect(family.features).toContain('Full event history & search');
		expect(lifetime.features).toContain('Never pay monthly again');
		expect(lifetime.features).toContain('Founding member badge');
	});
});

describe('pricing FAQs', () => {
	it('has the four legacy rows, question first', () => {
		expect(PRICING_FAQS).toHaveLength(4);
		expect(PRICING_FAQS[0].q).toBe('What counts as a "family member"?');
		expect(PRICING_FAQS[2].q).toBe('What happens if I cancel?');
		expect(PRICING_FAQS[3].q).toBe("Is my family's data safe?");
	});
});

describe('checkout strings', () => {
	it('names the lifetime plan differently and every other plan Family Master', () => {
		expect(checkoutPlanName('lifetime')).toBe('Family Master Lifetime');
		expect(checkoutPlanName('monthly')).toBe('Family Master');
		expect(checkoutPlanName('annual')).toBe('Family Master');
	});

	it('keeps the legacy redirect and the three stub sentences', () => {
		expect(CHECKOUT_LOGIN_REDIRECT).toBe('/login?redirect=/checkout');
		expect(CHECKOUT_NOT_AUTHENTICATED_MESSAGE).toBe('Not authenticated');
		expect(CHECKOUT_INVALID_MESSAGE).toBe('Invalid purchase data');
		expect(CHECKOUT_STUB_MESSAGE).toBe('Checkout is not yet available.');
	});
});

describe('fullestFamilyMemberCount', () => {
	it('answers zero for no families, the count otherwise, and the fullest of several', () => {
		expect(fullestFamilyMemberCount([])).toBe(0);
		expect(fullestFamilyMemberCount([{ memberCount: 2 }])).toBe(2);
		expect(fullestFamilyMemberCount([{ memberCount: 2 }, { memberCount: 7 }, { memberCount: 3 }])).toBe(7);
		expect(fullestFamilyMemberCount([{ memberCount: 5 }, { memberCount: 5 }])).toBe(5);
	});
});
