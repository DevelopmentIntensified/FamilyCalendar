// The visual check: one screenshot per catalog page, per project.
//
// `PAGES_MODULE` narrows the run to one module (scripts/pages-run.mjs sets it);
// unset means every page. Baselines live in e2e/pages/__screenshots__/ and are
// committed — `npm run visual:baseline -- <module>` writes them,
// `npm run visual:check -- <module>` compares.
//
// Doc: e2e/pages/README.md
import { test, expect } from '@playwright/test';
import { pagesForModule } from './catalog';
import { gotoReady, openAs } from './session';
import { closeSessionDb } from '../testUtils';

// The cookie helpers run on the app's module-level pool; a worker that used
// them ends it before exiting so the open socket cannot keep it alive.
test.afterAll(async () => {
	await closeSessionDb();
});

for (const entry of pagesForModule(process.env.PAGES_MODULE)) {
	test(`${entry.module} / ${entry.name}`, async ({ page }) => {
		const seed = await openAs(page, entry.seed);
		await gotoReady(page, entry, seed);

		// Settle every late fetch before the pixels are compared. Deliberately
		// NOT part of gotoReady: K-11 times the arrival and must not wait for
		// idle.
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveScreenshot(`${entry.module}-${entry.name}.png`, {
			fullPage: true,
			animations: 'disabled',
			// Two runs on one machine are byte-identical, so the tolerance only
			// absorbs rasteriser noise. At 1% a fixed banner laid over the page
			// heading (light fill, ~0.5% of a 1280×800 page in changed text
			// pixels) passed unnoticed; 0.2% catches it.
			maxDiffPixelRatio: 0.002,
			mask: (entry.mask ?? []).map((selector) => page.locator(selector))
		});
	});
}
