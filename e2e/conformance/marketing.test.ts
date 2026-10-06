import { test, expect } from '@playwright/test';
import { collectRoute, marketingTokens, HOLD_OUT } from './helpers';
import { findDeviations, formatDeviations } from '../../src/lib/conformance/tokens';

/**
 * 131 — the harness must be proven on a page known to be right before it is
 * allowed to judge anything. The token set is derived from seven marketing
 * routes; /pricing is held out of that corpus, so a zero here means the design
 * language is genuinely shared across pages rather than measured against
 * itself.
 */
test('a marketing route reports zero deviations against the marketing token set', async ({
	page
}) => {
	const tokens = await marketingTokens(page);
	const heldOut = await collectRoute(page, HOLD_OUT);
	const deviations = findDeviations(heldOut, tokens);
	expect(deviations.length, formatDeviations(deviations)).toBe(0);
});
