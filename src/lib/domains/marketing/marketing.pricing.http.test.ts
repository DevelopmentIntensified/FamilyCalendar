/**
 * The `/pricing` load and the `/checkout` purchase action: the two rules a
 * signed-out or malformed request meets. The quote itself needs tables, so its
 * load is in `marketing.pricing.http.db.test.ts`.
 *
 * Values are the legacy routes': the `pricing_view` event for a signed-in
 * visit, the free plan's six members (Q-018 B), and the stub's three sentences.
 *
 * Doc: ./README.md#invariants
 */
import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { invokeAction, invokeLoad } from '$lib/kernel/testing/invokeHandlers.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { checkoutPageLoad, checkoutPurchaseAction, pricingPageLoad } from './marketing.http.server';

const signedIn = {
	id: 'u1',
	email: 'u1@example.test',
	roles: [],
	firstName: 'Alex',
	lastName: 'Doe'
};

describe('GET /pricing', () => {
	it('hands the page the free plan’s member limit from billing’s policy', async () => {
		const data = await invokeLoad(pricingPageLoad, { ctx: testCtx(), path: '/pricing' });

		expect(data.memberLimit).toBe(6);
	});

	it('records one pricing_view event for a signed-in visit', async () => {
		const ctx = testCtx();
		await invokeLoad(pricingPageLoad, { ctx, path: '/pricing', user: signedIn });

		expect(ctx.log.entries).toEqual([
			{ level: 'info', event: 'pricing_view', fields: { userId: 'u1', planType: 'view' } }
		]);
	});

	it('records nothing for an anonymous visit', async () => {
		const ctx = testCtx();
		await invokeLoad(pricingPageLoad, { ctx, path: '/pricing' });

		expect(ctx.log.entries).toEqual([]);
	});
});

describe('GET /checkout', () => {
	it('sends an anonymous visitor to the login page with the way back', async () => {
		let thrown: unknown;
		try {
			await invokeLoad(checkoutPageLoad, { ctx: testCtx(), path: '/checkout' });
		} catch (error) {
			thrown = error;
		}

		expect(isRedirect(thrown)).toBe(true);
		if (!isRedirect(thrown)) return;
		expect(thrown.status).toBe(302);
		expect(thrown.location).toBe('/login?redirect=/checkout');
	});
});

describe('POST /checkout?/purchase', () => {
	it('answers the legacy sentence when the caller has no session', async () => {
		const result = await invokeAction(checkoutPurchaseAction, {
			ctx: testCtx(),
			path: '/checkout',
			form: { planType: 'monthly', finalPrice: '9' }
		});

		expect(result).toEqual({ success: false, error: 'Not authenticated' });
	});

	it('refuses a missing or unknown plan and a missing price', async () => {
		const invalid = { success: false, error: 'Invalid purchase data' };
		const forms: ReadonlyArray<Record<string, string>> = [
			{ finalPrice: '9' },
			{ planType: 'Weekly', finalPrice: '9' },
			{ planType: 'monthly' },
			{ planType: 'monthly', finalPrice: '0' },
			{ planType: 'monthly', finalPrice: '' }
		];

		for (const form of forms) {
			const result = await invokeAction(checkoutPurchaseAction, {
				ctx: testCtx(),
				path: '/checkout',
				user: signedIn,
				form
			});
			expect(result).toEqual(invalid);
		}
	});

	it('answers the stub for a well-formed post, without charging anyone', async () => {
		const result = await invokeAction(checkoutPurchaseAction, {
			ctx: testCtx(),
			path: '/checkout',
			user: signedIn,
			form: { planType: 'annual', finalPrice: '90' }
		});

		expect(result).toEqual({ success: false, message: 'Checkout is not yet available.' });
	});
});
