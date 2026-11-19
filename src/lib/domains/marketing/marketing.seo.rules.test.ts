/**
 * The share tags are only worth having if they are true.
 *
 * A metadata table is a second place a title lives, and the second place is the
 * one that goes stale: a page gets renamed, the table keeps the old string, and
 * the card starts advertising a page that no longer says that. Nothing fails.
 * So the table is checked against the routes themselves — read off disk, not
 * against a list this file maintains.
 *
 * What it holds us to:
 *   · every marketing route that renders a <title> has a row, and says the same
 *     thing in it
 *   · nothing emits a <meta name="description"> of its own: the layout already
 *     does, and two of them is a duplicate
 *   · the image the tags point at is a real file of the declared size
 *   · the tags self-reference the origin they were given, on every environment
 *
 * The layout's own markup (it emits the description, the canonical link and
 * these tags, and no <title>) is checked by the S7 visual check.
 *
 * Doc: ./README.md#invariants
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKETING_PAGES, SITE, pageSeo, type SeoMetaTag } from './marketing.seo.rules';

const routesRoot = join(process.cwd(), 'src', 'routes', '(marketing)');

/** Directories under `(marketing)` that hold a +page.svelte, minus the groups that are not site pages. */
function marketingRoutes(): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(routesRoot, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		if (entry.name === 'family' || entry.name === 'join' || entry.name === 'invite') continue;
		if (existsSync(join(routesRoot, entry.name, '+page.svelte'))) found.push(entry.name);
	}
	return found.sort();
}

function property(tags: readonly SeoMetaTag[], name: string): string | undefined {
	return tags.find((tag) => 'property' in tag && tag.property === name)?.content;
}

function named(tags: readonly SeoMetaTag[], name: string): string | undefined {
	return tags.find((tag) => 'name' in tag && tag.name === name)?.content;
}

describe('the seo table matches the routes', () => {
	const routes = marketingRoutes();

	it('finds the marketing routes at all', () => {
		expect(routes.length).toBeGreaterThan(10);
	});

	it.each(routes)('/%s has a row, and the row says what the page says', (route) => {
		const source = readFileSync(join(routesRoot, route, '+page.svelte'), 'utf8');
		const title = source.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
		// A route with no <title> inherits the site default and is fine; one with
		// a title and no row is a card advertising stale copy.
		if (!title) {
			expect(MARKETING_PAGES[`/${route}`]).toBeUndefined();
			return;
		}
		const row = MARKETING_PAGES[`/${route}`];
		expect(row, `/${route} sets a <title> but has no row in MARKETING_PAGES`).toBeDefined();
		expect(row?.title).toBe(title);
		// A description has to earn its place in a SERP listing, so the floor only
		// applies to pages that are actually indexed. /checkout is noindex: nobody
		// searches for it and nothing about it should be optimised.
		if (!row?.noindex) {
			expect(row?.description.length ?? 0).toBeGreaterThan(40);
		}
	});

	it.each(routes)('/%s does not emit its own description', (route) => {
		const source = readFileSync(join(routesRoot, route, '+page.svelte'), 'utf8');
		// The layout emits one for every route; a second is a duplicate, and a
		// crawler picks whichever it likes.
		expect(source).not.toMatch(/<meta[^>]*name=["']description["']/);
	});
});

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

describe('the image the tags point at', () => {
	it('exists, and is the size the tags claim', () => {
		const file = join(process.cwd(), 'static', SITE.image.replace(/^\//, ''));
		expect(existsSync(file), `${SITE.image} is missing — run: npm run brand:build`).toBe(true);
		const { width, height } = readPngSize(file);
		expect([width, height]).toEqual([1200, 630]);
		expect([SITE.imageWidth, SITE.imageHeight]).toEqual([1200, 630]);
	});
});

/** width/height out of the IHDR chunk — the one PNG header field that is fixed. */
function readPngSize(file: string): { width: number; height: number } {
	const buf = readFileSync(file);
	if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
