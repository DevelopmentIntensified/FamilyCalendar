/**
 * The share tags are only worth having if they are true: they self-reference
 * the origin they were given on every environment, point at an absolute image,
 * fall back to the site defaults, and mark the transactional pages noindex.
 *
 * The table against the route files and the image on disk are checked in
 * marketing.pages.http.test.ts (reading files keeps them out of this pure test,
 * R4). The layout's own markup (it emits the description, the canonical link and
 * these tags, and no <title>) is checked by the S7 visual check.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { MARKETING_PAGES, SITE, pageSeo, pageTitle, type SeoMetaTag } from './marketing.seo.rules';

function property(tags: readonly SeoMetaTag[], name: string): string | undefined {
	return tags.find((tag) => 'property' in tag && tag.property === name)?.content;
}

function named(tags: readonly SeoMetaTag[], name: string): string | undefined {
	return tags.find((tag) => 'name' in tag && tag.name === name)?.content;
}

describe('pageSeo', () => {
	const ORIGIN = 'https://familyplanz.com';

	it('describes a page with its row, a self-referencing canonical and the tags', () => {
		const seo = pageSeo(ORIGIN, '/pricing');
		expect(seo.title).toBe('Pricing - Family Planz');
		expect(seo.description).toBe(MARKETING_PAGES['/pricing']?.description);
		expect(seo.canonical).toBe('https://familyplanz.com/pricing');
		expect(property(seo.meta, 'og:title')).toBe('Pricing - Family Planz');
		expect(named(seo.meta, 'twitter:description')).toBe(MARKETING_PAGES['/pricing']?.description);
	});

	it('points og:image at an absolute URL', () => {
		// A relative og:image is dropped outright by every crawler, silently.
		expect(property(pageSeo(ORIGIN, '/pricing').meta, 'og:image')).toBe(
			'https://familyplanz.com/brand/og.png'
		);
	});

	it.each(['https://familyplanz.com', 'https://test.familyplanz.com', 'https://x--abc.vercel.app'])(
		'builds canonical and og:url from the origin it was given: %s',
		(origin) => {
			// The origin comes off the request, so test and preview self-reference
			// too. A hardcoded familyplanz.com would make every test deployment
			// canonicalise itself to production.
			const seo = pageSeo(origin, '/pricing');
			expect(seo.canonical).toBe(`${origin}/pricing`);
			expect(property(seo.meta, 'og:url')).toBe(`${origin}/pricing`);
			expect(property(seo.meta, 'og:image')).toBe(`${origin}/brand/og.png`);
			expect(named(seo.meta, 'twitter:image')).toBe(`${origin}/brand/og.png`);
		}
	);

	it('never leaves a double slash on the origin', () => {
		const seo = pageSeo('https://familyplanz.com/', '/x');
		expect(seo.canonical).toBe('https://familyplanz.com/x');
		expect(property(seo.meta, 'og:image')).toBe('https://familyplanz.com/brand/og.png');
	});

	it('declares the card size, so a timeline does not guess a square crop', () => {
		const { meta } = pageSeo(ORIGIN, '/pricing');
		expect(property(meta, 'og:image:width')).toBe('1200');
		expect(property(meta, 'og:image:height')).toBe('630');
		expect(property(meta, 'og:image:type')).toBe('image/png');
	});

	it('carries an alt for the card', () => {
		const { meta } = pageSeo(ORIGIN, '/pricing');
		expect(property(meta, 'og:image:alt')).toBe("Everyone's week, on one page.");
		expect(named(meta, 'twitter:image:alt')).toBe("Everyone's week, on one page.");
	});

	it('asks for a large summary card, not a square thumbnail', () => {
		expect(named(pageSeo(ORIGIN, '/pricing').meta, 'twitter:card')).toBe('summary_large_image');
	});

	it('ignores a trailing slash in the lookup but keeps the requested path in the canonical', () => {
		const seo = pageSeo(ORIGIN, '/pricing/');
		expect(seo.title).toBe('Pricing - Family Planz');
		expect(seo.canonical).toBe('https://familyplanz.com/pricing/');
	});

	it('falls back to the site default rather than throwing on a new route', () => {
		const seo = pageSeo(ORIGIN, '/some/route/that/is/new');
		expect(seo.title).toBe(SITE.defaultTitle);
		expect(seo.description).toBe(SITE.defaultDescription);
		expect(named(seo.meta, 'robots')).toBeUndefined();
	});

	type RobotsCase = { readonly pathname: string; readonly noindex: boolean };

	it.each<RobotsCase>([
		{ pathname: '/', noindex: false },
		{ pathname: '/features', noindex: false },
		{ pathname: '/pricing', noindex: false },
		{ pathname: '/about', noindex: false },
		{ pathname: '/changelog', noindex: false },
		{ pathname: '/roadmap', noindex: false },
		{ pathname: '/android', noindex: false },
		{ pathname: '/contact', noindex: false },
		{ pathname: '/privacy', noindex: false },
		{ pathname: '/login', noindex: true },
		{ pathname: '/signup', noindex: true },
		{ pathname: '/forgot-password', noindex: true },
		{ pathname: '/forgot-password/reset', noindex: true },
		{ pathname: '/checkout', noindex: true }
	])('$pathname is noindex: $noindex', ({ pathname, noindex }) => {
		const robots = named(pageSeo(ORIGIN, pathname).meta, 'robots');
		expect(robots).toBe(noindex ? 'noindex, follow' : undefined);
	});

	it('puts robots last, after the share tags', () => {
		const { meta } = pageSeo(ORIGIN, '/checkout');
		expect(meta.at(-1)).toEqual({ name: 'robots', content: 'noindex, follow' });
	});
});

describe('pageTitle', () => {
	it('is the row’s own title, so no page renders a second one', () => {
		expect(pageTitle('/')).toBe(MARKETING_PAGES['/']?.title);
		expect(pageTitle('/about')).toBe(MARKETING_PAGES['/about']?.title);
	});

	it('ignores a trailing slash, like the lookup it wraps', () => {
		expect(pageTitle('/features/')).toBe(MARKETING_PAGES['/features']?.title);
	});

	it('falls back to the site default rather than throwing', () => {
		expect(pageTitle('/some/route/that/is/new')).toBe(SITE.defaultTitle);
	});
});
