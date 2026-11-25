/**
 * Development seed: the data the legacy `src/lib/server/seed.ts` wrote, composed
 * from the modules that own it. The legacy file went with the sweep (APP-05)
 * while `package.json`'s `db:seed` and the repo README still pointed at it, so
 * a fresh dev or e2e database had no subscription tiers, no discounts and no
 * demo ads.
 *
 * Each leg is the owning module's insert-if-absent: `billing`'s
 * `ensureBillingDefaults` writes the six tiers and two discounts, and
 * `sponsored`'s `seedSponsoredDemoAdEvents` the five `test-ad-*` rows. A second
 * run therefore changes nothing. Order follows the legacy seed: the plans the
 * ads target first, then the ads.
 *
 * The app never seeds at boot: this is the developer action `db:seed` runs
 * through `scripts/db-seed.ts`, against `DATABASE_URL` (see the README's
 * Quickstart). Nothing here is a request path, so no route imports it.
 *
 * Doc: ./README.md#public-interface
 */
import { ensureBillingDefaults } from '$lib/domains/billing/index.server';
import { seedSponsoredDemoAdEvents } from '$lib/domains/sponsored/index.server';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';

/**
 * Write the dev seed's rows through each owning module, on the ctx's database
 * and clock, and log one `dev_seed_complete` line with the new ad-row count.
 * Idempotent: running it again writes nothing.
 */
export async function runDevSeed(ctx: Ctx): Promise<void> {
	await ensureBillingDefaults(ctx);
	const demoAds = await seedSponsoredDemoAdEvents(ctx);
	ctx.log.info('dev_seed_complete', { demoAds });
}
