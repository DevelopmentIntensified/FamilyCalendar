// Prerendered static page (no DB reads, no user data).
// Note: this SvelteKit version ignores page options exported from the
// component itself, so it lives here.
export const prerender = true;
// Override the marketing group's ssr=false (CSR-only on Vercel) so the
// prerendered HTML actually contains the page content (SEO).
export const ssr = true;
