// Prerendered static page (no DB reads, no user data).
// Note: this SvelteKit version ignores page options exported from the
// component itself, so it lives here.
import { CONTENT_PAGE_OPTIONS } from '$lib/domains/marketing/index';

// Always prerendered and server-rendered, overriding the group's ADAPTER flags,
// so the text reaches a crawler.
export const prerender = CONTENT_PAGE_OPTIONS.prerender;
export const ssr = CONTENT_PAGE_OPTIONS.ssr;
