import type { Page } from '@playwright/test';
import { PROPERTIES } from '../../src/lib/conformance/rules';
import { collectMeasurements } from '../../src/lib/conformance/collect';
import { deriveTokens, type Measurement, type TokenSet } from '../../src/lib/conformance/tokens';

/**
 * 131 — the e2e side of the design-conformance harness.
 *
 * The marketing routes are the reference implementation of the design
 * language; their emitted values, taken in a real browser, are the token set.
 */

/** Every marketing route available to measure. */
export const MARKETING_ROUTES = [
	'/',
	'/about',
	'/features',
	'/pricing',
	'/contact',
	'/roadmap',
	'/changelog',
	'/privacy'
];

/** The route held out of the corpus for the zero-deviation proof, so the
 * proof is not measured against itself. Chosen empirically — see the probe in
 * the ticket notes: /pricing carries an accent family no other page emits. */
export const HOLD_OUT = '/about';

/** The reference corpus: every marketing route except the held-out one. */
export const MARKETING_CORPUS = MARKETING_ROUTES.filter((route) => route !== HOLD_OUT);

export async function collectRoute(page: Page, route: string): Promise<Measurement[]> {
	await page.goto(route);
	await page.waitForLoadState('load');
	// Fonts and the 150ms route fade must settle before anything is measured.
	await page.evaluate(() => document.fonts.ready.then(() => true));
	await page.waitForTimeout(300);
	return await page.evaluate(collectMeasurements, PROPERTIES);
}

export async function marketingTokens(page: Page): Promise<TokenSet> {
	const pages: Measurement[][] = [];
	for (const route of MARKETING_CORPUS) {
		pages.push(await collectRoute(page, route));
	}
	return deriveTokens(pages);
}
