/**
 * `GET /checkout` against Postgres: the signed-in load quotes through billing's
 * services and names the plan the legacy load named. Base prices are the legacy
 * `BASE_PRICES` (9 / 90 / 150); discount lines are billing's rows, so the tests
 * assert the wiring (the quote is the selected plan's price) rather than a
 * discount total that depends on seeded rows.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect } from 'vitest';
import { invokeLoad } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { checkoutPageLoad } from './marketing.http.server';

describe('GET /checkout', () => {
	rollbackTest('quotes the monthly plan by default and names it Family Master', async (db) => {
		const user = await seedUser(db);
		const data = await invokeLoad(checkoutPageLoad, {
			ctx: testCtx({ db }),
			path: '/checkout',
			user
		});

		expect(data.isLoggedIn).toBe(true);
		expect(data.selectedPlan.type).toBe('monthly');
		expect(data.selectedPlan.name).toBe('Family Master');
		expect(data.checkoutResult.originalPrice).toBe(9);
		expect(data.selectedPlan.price).toBe(data.checkoutResult.finalPrice);
		expect(data.userDiscounts).toEqual(expect.any(Array));
	});

	rollbackTest('quotes the annual plan when ?plan=annual', async (db) => {
		const user = await seedUser(db);
		const data = await invokeLoad(checkoutPageLoad, {
			ctx: testCtx({ db }),
			path: '/checkout',
			query: { plan: 'annual' },
			user
		});

		expect(data.selectedPlan.type).toBe('annual');
		expect(data.selectedPlan.name).toBe('Family Master');
		expect(data.checkoutResult.originalPrice).toBe(90);
		expect(data.selectedPlan.price).toBe(data.checkoutResult.finalPrice);
	});

	rollbackTest('quotes the lifetime plan and names it Family Master Lifetime', async (db) => {
		const user = await seedUser(db);
		const data = await invokeLoad(checkoutPageLoad, {
			ctx: testCtx({ db }),
			path: '/checkout',
			query: { plan: 'lifetime' },
			user
		});

		expect(data.selectedPlan.type).toBe('lifetime');
		expect(data.selectedPlan.name).toBe('Family Master Lifetime');
		expect(data.checkoutResult.originalPrice).toBe(150);
		expect(data.selectedPlan.price).toBe(data.checkoutResult.finalPrice);
	});

	rollbackTest('falls back to the monthly plan for an unknown ?plan', async (db) => {
		const user = await seedUser(db);
		const data = await invokeLoad(checkoutPageLoad, {
			ctx: testCtx({ db }),
			path: '/checkout',
			query: { plan: 'Monthly' },
			user
		});

		expect(data.selectedPlan.type).toBe('monthly');
		expect(data.checkoutResult.originalPrice).toBe(9);
	});
});
