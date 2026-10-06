import { test, expect, loginWithSession } from '../testUtils';
import { collectRoute, marketingTokens } from './helpers';
import { findDeviations, formatDeviations } from '../../src/lib/conformance/tokens';

/**
 * 131 — the known-bad proof. Issue 129 measured the settings surface against
 * the approved prototype and found the identity avatar wearing Tailwind
 * orange-100 where the approved design wears the blush #FED5CF, and the
 * section title at .1em tracking where the approved design sits at .08em.
 * Both are off the language the marketing pages emit, so this test must find
 * them — it is the check that a "matches the prototype" verdict cannot be an
 * opinion any more.
 */
test('#129: /account at 1000px reports the settings-rail deviations', async ({
	page,
	testUser
}) => {
	const tokens = await marketingTokens(page);

	await loginWithSession(page, testUser.email);
	await page.setViewportSize({ width: 1000, height: 900 });
	const measured = await collectRoute(page, '/account');
	const deviations = findDeviations(measured, tokens);
	console.log(`design-conformance /account @1000px:\n${formatDeviations(deviations)}`);

	const avatar = deviations.find(
		(d) => d.property === 'background-color' && d.actual === '#ffedd5'
	);
	expect(
		avatar,
		`the identity avatar (orange-100) must be flagged off-palette:\n${formatDeviations(deviations)}`
	).toBeTruthy();
	expect(avatar!.selector).toContain('account-initial');
	expect(avatar!.expected).toContain('#fed5cf');

	const title = deviations.find((d) => d.property === 'letter-spacing');
	expect(
		title,
		'the section title (.1em tracking) must be flagged against the marketing tracking set'
	).toBeTruthy();
	expect(title!.selector).toContain('px-3.pb-2');
});
