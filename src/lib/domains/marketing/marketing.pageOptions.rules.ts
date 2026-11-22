/**
 * Prerender/SSR flags for the `(marketing)` route group. The group follows the
 * deploy adapter: the static build prerenders and renders on the server, every
 * other target is client-rendered (CSR-only on Vercel). `/changelog` and
 * `/roadmap` are the two content pages that must always ship their HTML, or
 * their text never reaches a crawler. `/` server-renders on every adapter too
 * (never prerendered: its navbar reads the viewer), so the landing page is
 * on screen at the `load` event instead of after the client boot.
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

/**
 * `/` is server-rendered on every adapter, so its HTML (hero, highlights, the
 * 1-2-3 demo) exists at `load`; the group's prerender flag still applies, and a
 * logged-in visitor still gets their own navbar from the request's locals.
 */
export const HOME_PAGE_OPTIONS: Pick<MarketingPageOptions, 'ssr'> = { ssr: true };
