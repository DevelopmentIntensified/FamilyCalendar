import { strayRootPostAction } from '$lib/domains/marketing/index.server';

/** Issue 276: a stray POST to `/` answers PRG instead of SvelteKit's 405 page. */
export const actions = { default: strayRootPostAction };
