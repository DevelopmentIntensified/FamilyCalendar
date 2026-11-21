/**
 * shell frame rules: which routes get the app chrome, how far `<main>` sits
 * below the fixed banner stack, and whether the on-screen keyboard is open.
 *
 * Pure and isomorphic (R4): the route id, the measured height and the viewport
 * numbers are arguments, so the root layout and the components never carry a
 * second copy of the decision.
 *
 * Doc: ./README.md#invariants
 */

/** The route-id prefixes that render the app chrome (the root navbar + tab bar). */
const APP_CHROME_PREFIXES = ['/(calendar)/calendar', '/(family)'] as const;

/**
 * Chrome is app-only: the calendar and family groups get the navbar and the
 * tab bar; marketing, admin, `/report-bug`, `/share-target`, `/claim`,
 * `/merge-guest` and the account subtree render their own frames (account and
 * admin widen this rule at their own ports — Q-073). `routeId` is
 * `page.route.id`, which includes the group segment and is null on a 404.
 */
export function shellChromeForRoute(routeId: string | null | undefined): 'app' | 'none' {
	if (!routeId) return 'none';
	for (const prefix of APP_CHROME_PREFIXES) {
		if (routeId === prefix || routeId.startsWith(`${prefix}/`)) return 'app';
	}
	return 'none';
}

/** The one-line guess the legacy layout used before its first measurement (#259). */
const BANNER_GUESS_PX = 40;

/**
 * `<main>`'s top offset: the measured banner-stack height once one exists,
 * else the legacy one-line guess when any banner is up, else 0. Banners wrap
 * to several lines on a phone (the verify form, the offline copy), which is
 * why the measured height wins over a fixed `mt-10` (#259).
 */
export function shellBannerOffset(measuredHeight: number, bannerCount: number): number {
	if (measuredHeight > 0) return measuredHeight;
	return bannerCount > 0 ? BANNER_GUESS_PX : 0;
}

/** The viewport inset above which the fixed tab bar hides (legacy BottomNav). */
const KEYBOARD_INSET_PX = 150;

/**
 * True while an on-screen keyboard covers part of the viewport:
 * `innerHeight - visualViewport.height > 150` (`BottomNav.svelte:88-118`).
 * A missing viewport (SSR, older browsers) means "not open". The bar toggles a
 * class with this answer instead of unmounting, so a11y keeps seeing it.
 */
export function shellIsKeyboardOpen(
	innerHeight: number,
	visualViewportHeight: number | null | undefined
): boolean {
	if (!innerHeight || visualViewportHeight == null) return false;
	return innerHeight - visualViewportHeight > KEYBOARD_INSET_PX;
}
