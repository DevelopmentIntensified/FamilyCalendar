/**
 * Prerender/SSR flags for the `(marketing)` route group. The group follows the
 * deploy adapter: the static build prerenders and renders on the server, every
 * other target is client-rendered (CSR-only on Vercel). `/changelog` and
 * `/roadmap` are the two content pages that must always ship their HTML, or
 * their text never reaches a crawler.
 *
 * The adapter is a parameter: a v2 domain may not read `$env` (rule R6), so the
 * route reads `ADAPTER` from `app` and hands it in.
 *
 * Doc: ./README.md#invariants
 */

export type MarketingPageOptions = {
	readonly prerender: boolean;
	readonly ssr: boolean;
};

/** The group's flags: both on for the static adapter, both off for any other. */
export function marketingPageOptions(adapter: string): MarketingPageOptions {
	const isStatic = adapter === 'static';
	return { prerender: isStatic, ssr: isStatic };
}

/** `/changelog` and `/roadmap` override the group: always prerendered, always server-rendered. */
export const CONTENT_PAGE_OPTIONS: MarketingPageOptions = { prerender: true, ssr: true };
