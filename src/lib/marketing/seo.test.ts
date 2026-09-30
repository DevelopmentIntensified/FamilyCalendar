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
 *   · nothing emits a <meta name="description"> of its own any more, because the
 *     layout already does and two of them is a duplicate
 *   · the layout emits og and canonical, and does NOT emit a <title> (the pages
 *     own that; two <title> elements is the bug this whole arrangement avoids)
 *   · the image the tags point at is a real file of the declared size
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTES, SITE, seoFor, seoTags, absolute } from './seo';

const root = join(process.cwd(), 'src', 'routes', '(marketing)');

/** every marketing route directory holding a +page.svelte */
function marketingRoutes(): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		if (entry.name === 'family' || entry.name === 'join' || entry.name === 'invite') continue;
		const page = join(root, entry.name, '+page.svelte');
		if (existsSync(page)) out.push(entry.name);
	}
	return out.sort();
}

const titleIn = (src: string) => src.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();

describe('the seo table matches the routes', () => {
	const routes = marketingRoutes();

	it('finds the marketing routes at all', () => {
		expect(routes.length).toBeGreaterThan(10);
	});

	it.each(routes)('/%s has a row, and the row says what the page says', (route) => {
		const src = readFileSync(join(root, route, '+page.svelte'), 'utf8');
		const title = titleIn(src);
		// A route with no <title> inherits the site default and is fine; one with
		// a title and no row is a card advertising stale copy.
		if (!title) {
			expect(ROUTES[`/${route}`]).toBeUndefined();
			return;
		}
		const row = ROUTES[`/${route}`];
		expect(row, `/${route} sets a <title> but has no row in seo.ts`).toBeDefined();
		expect(row?.title).toBe(title);
		// A description has to earn its place in a SERP listing, so the floor only
		// applies to pages that are actually indexed. /checkout is noindex: nobody
		// searches for it and nothing about it should be optimised.
		if (!row?.noindex) {
			expect(row?.description.length ?? 0).toBeGreaterThan(40);
		}
	});

	it.each(routes)('/%s does not emit its own description', (route) => {
		const src = readFileSync(join(root, route, '+page.svelte'), 'utf8');
		// The layout emits one for every route; a second is a duplicate, and a
		// crawler picks whichever it likes.
		expect(src).not.toMatch(/<meta[^>]*name=["']description["']/);
	});
});

describe('the layout does the emitting, and does not fight the pages', () => {
	const layout = readFileSync(join(root, '+layout.svelte'), 'utf8');

	it('emits og and canonical', () => {
		expect(layout).toMatch(/<link rel="canonical"/);
		expect(layout).toMatch(/seoTags/);
	});

	it('emits no <title> of its own', () => {
		// Every page already sets one. Two <title> elements in a document is
		// exactly the duplication this arrangement exists to prevent.
		// Comments are stripped first, both flavours: the layout explains this
		// rule in a comment that necessarily contains the word, and a check that
		// fails on its own documentation is a check that gets deleted.
		const markup = layout
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/^\s*\/\/.*$/gm, '');
		expect(markup).not.toMatch(/<title>/);
	});
});

describe('the tags themselves', () => {
	const tags = seoTags('https://familyplanz.com', '/pricing');
	const byProperty = (p: string) => tags.find((t) => 'property' in t && t.property === p)?.content;
	const byName = (n: string) => tags.find((t) => 'name' in t && t.name === n)?.content;

	it('points og:image at an absolute URL', () => {
		// A relative og:image is dropped outright by every crawler, silently.
		expect(byProperty('og:image')).toBe('https://familyplanz.com/brand/og.png');
	});

	it('self-references the origin it was given, on every environment', () => {
		expect(byProperty('og:url')).toBe('https://familyplanz.com/pricing');
		// The origin comes off the request, so test and preview self-reference
		// too. A hardcoded familyplanz.com would make every test deployment
		// canonicalise itself to production.
		for (const origin of ['https://test.familyplanz.com', 'https://x--abc.vercel.app']) {
			const t = seoTags(origin, '/pricing');
			expect(t.find((x) => 'property' in x && x.property === 'og:url')?.content).toBe(
				`${origin}/pricing`
			);
			expect(t.find((x) => 'property' in x && x.property === 'og:image')?.content).toBe(
				`${origin}/brand/og.png`
			);
		}
	});

	it('declares the card size, so a timeline does not guess a square crop', () => {
		expect(byProperty('og:image:width')).toBe(String(SITE.imageWidth));
		expect(byProperty('og:image:height')).toBe(String(SITE.imageHeight));
		expect(byProperty('og:image:type')).toBe('image/png');
	});

	it('carries an alt for the card', () => {
		expect(byProperty('og:image:alt')).toBeTruthy();
		expect(byName('twitter:image:alt')).toBeTruthy();
	});

	it('asks for a large summary card, not a square thumbnail', () => {
		expect(byName('twitter:card')).toBe('summary_large_image');
	});

	it('noindexes the transactional routes and indexes the public ones', () => {
		const names = (p: string) => seoTags('https://x.test', p).map((t) => ('name' in t ? t.name : ''));
		expect(names('/checkout')).toContain('robots');
		expect(names('/signup')).toContain('robots');
		expect(names('/')).not.toContain('robots');
		expect(names('/features')).not.toContain('robots');
	});
});

describe('the image the tags point at', () => {
	it('exists, and is the size the tags claim', () => {
		const file = join(process.cwd(), 'static', SITE.image.replace(/^\//, ''));
		expect(existsSync(file), `${SITE.image} is missing — run: npm run brand:build`).toBe(true);
		const { width, height } = readPngSize(file);
		expect([width, height]).toEqual([SITE.imageWidth, SITE.imageHeight]);
	});
});

describe('lookups', () => {
	it('tolerates a trailing slash', () => {
		expect(seoFor('/pricing/').title).toBe(ROUTES['/pricing'].title);
	});

	it('falls back to the site default rather than throwing on a new route', () => {
		expect(seoFor('/some/route/that/is/new').title).toBe(SITE.defaultTitle);
	});

	it('never leaves a double slash on the origin', () => {
		expect(absolute('https://familyplanz.com/', '/x')).toBe('https://familyplanz.com/x');
	});
});

/** width/height out of the IHDR chunk — the one PNG header field that is fixed. */
function readPngSize(file: string): { width: number; height: number } {
	const buf = readFileSync(file);
	if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
