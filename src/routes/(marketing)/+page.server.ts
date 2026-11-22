import { HOME_PAGE_OPTIONS } from '$lib/domains/marketing/index';
import { strayRootPostAction } from '$lib/domains/marketing/index.server';

// The landing page ships its HTML on every adapter (the group is CSR-only off
// the static build), so it is painted at `load`, not after the client boot.
export const ssr = HOME_PAGE_OPTIONS.ssr;

/** Issue 276: a stray POST to `/` answers PRG instead of SvelteKit's 405 page. */
export const actions = { default: strayRootPostAction };
