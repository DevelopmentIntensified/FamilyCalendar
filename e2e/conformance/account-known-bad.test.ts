import { test, expect, loginWithSession } from '../testUtils';
import { collectRoute, marketingTokens } from './helpers';
import { findDeviations, formatDeviations } from '../../src/lib/conformance/tokens';

/**
 * 129 + the owner ruling on 131's fork: the PROTOTYPE governs geometry (sizes
 * and spacing), the marketing tokens govern colour, type and shadow. /account
 * now carries the approved design, so this test is the proof it stopped
 * drifting: the harness must report zero deviations on every colour, type and
 * shadow property it tracks, while the rail's geometry — inexpressible from
 * the marketing pages (131's own finding) — is measured in the browser against
 * the prototype's own numbers: 1.25rem rail cards, 1rem stack gap, .08em
 * rail__title.
 */

/** Geometry and the rail title's .08em tracking are governed by the prototype
 *  (129 measures them there), not the marketing token set — asserted
 *  explicitly below instead of judged against marketing. */
const GEOMETRY = new Set([
	'border-radius',
	'letter-spacing',
	'padding-top',
	'padding-right',
	'padding-bottom',
	'padding-left',
	'row-gap',
	'column-gap'
]);

test('#129: /account at 1000px conforms — zero colour/type/shadow deviations, prototype geometry', async ({
	page,
	testUser
}) => {
	const tokens = await marketingTokens(page);

	await loginWithSession(page, testUser.email);
	await page.setViewportSize({ width: 1000, height: 900 });
	const measured = await collectRoute(page, '/account');
	const deviations = findDeviations(measured, tokens);
	console.log(`design-conformance /account @1000px:\n${formatDeviations(deviations)}`);

	const governed = deviations.filter((d) => !GEOMETRY.has(d.property));
	expect(
		governed,
		`the settings surface must sit inside the marketing colour/type/shadow set, with no finding left:\n${formatDeviations(deviations)}`
	).toHaveLength(0);

	const rail = await page.evaluate(() => {
		const style = (testid: string, property: string): string =>
			getComputedStyle(document.querySelector(`[data-testid="${testid}"]`)!).getPropertyValue(
				property
			);
		return {
			radius: style('account-rail-card', 'border-radius'),
			padding: style('account-rail-card', 'padding-top'),
			stack: style('account-rail', 'row-gap'),
			title: style('account-rail-title', 'letter-spacing'),
			width: style('account-rail-card', 'width')
		};
	});
	expect(rail.radius, 'the rail card is the prototype rail__card at 1.25rem').toBe('20px');
	expect(rail.padding, 'the rail card keeps 1rem of room, as the prototype spells it').toBe('16px');
	expect(rail.stack, 'the rail stacks its two cards 1rem apart').toBe('16px');
	expect(rail.title, 'the rail__title tracks at .08em against its 11px font').toBe('0.88px');
	expect(rail.width, 'the rail column sits in the 15rem grid track').toBe('240px');
});
