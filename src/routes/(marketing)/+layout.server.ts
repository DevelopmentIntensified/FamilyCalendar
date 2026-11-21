// Prerender/SSR follow the deploy adapter (the static build is prerendered and
// server-rendered; every other target is CSR-only).
import { ADAPTER } from '$env/static/private';
import { marketingLayoutLoad } from '$lib/domains/marketing/index.server';
import { marketingPageOptions } from '$lib/domains/marketing/index';

export const prerender = marketingPageOptions(ADAPTER).prerender;
export const ssr = marketingPageOptions(ADAPTER).ssr;

/** Origin, pathname and the viewer — the self-referencing canonical rule. */
export const load = marketingLayoutLoad;
