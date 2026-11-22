/**
 * Prerender/SSR flags of the `(marketing)` group: they follow `ADAPTER`, and
 * the two content pages are always on (legacy `(marketing)/+layout.server.ts`,
 * `changelog/+page.ts`, `roadmap/+page.ts`).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	CONTENT_PAGE_OPTIONS,
	HOME_PAGE_OPTIONS,
	marketingPageOptions,
	type MarketingPageOptions
} from './marketing.pageOptions.rules';

describe('marketingPageOptions', () => {
	type Case = { readonly adapter: string; readonly options: MarketingPageOptions };

	it.each<Case>([
		{ adapter: 'static', options: { prerender: true, ssr: true } },
		{ adapter: 'vercel', options: { prerender: false, ssr: false } },
		{ adapter: 'node', options: { prerender: false, ssr: false } },
		{ adapter: 'Static', options: { prerender: false, ssr: false } },
		{ adapter: '', options: { prerender: false, ssr: false } }
	])('follows ADAPTER: "$adapter" -> $options', ({ adapter, options }) => {
		expect(marketingPageOptions(adapter)).toEqual(options);
	});
});

describe('CONTENT_PAGE_OPTIONS', () => {
	it('follows ADAPTER for the group and forces the content pages on', () => {
		expect(marketingPageOptions('vercel')).toEqual({ prerender: false, ssr: false });
		expect(CONTENT_PAGE_OPTIONS).toEqual({ prerender: true, ssr: true });
	});
});

describe('HOME_PAGE_OPTIONS', () => {
	it('server-renders the landing page even where the group is client-rendered', () => {
		expect(marketingPageOptions('vercel').ssr).toBe(false);
		expect(HOME_PAGE_OPTIONS).toEqual({ ssr: true });
	});
});
