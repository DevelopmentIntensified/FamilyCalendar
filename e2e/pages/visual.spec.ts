// The visual check: one screenshot per catalog page, per project.
//
// `PAGES_MODULE` narrows the run to one module (scripts/pages-run.mjs sets it);
// unset means every page. Baselines live in e2e/pages/__screenshots__/ and are
// committed — `npm run visual:baseline -- <module>` writes them,
// `npm run visual:check -- <module>` compares.
//
// Doc: e2e/pages/README.md
import { test, expect } from '@playwright/test';
import { pagesForModule, resolvePath } from './catalog';
import { openAs } from './session';

for (const entry of pagesForModule(process.env.PAGES_MODULE)) {
	test(`${entry.module} / ${entry.name}`, async ({ page }) => {
		const seed = await openAs(page, entry.seed);

		await page.goto(resolvePath(entry.path, seed.params));
		await page.locator(entry.ready).first().waitFor({ state: 'visible' });

		await expect(page).toHaveScreenshot(`${entry.module}-${entry.name}.png`, {
			fullPage: true,
			animations: 'disabled',
			maxDiffPixelRatio: 0.01,
			mask: (entry.mask ?? []).map((selector) => page.locator(selector))
		});
	});
}
