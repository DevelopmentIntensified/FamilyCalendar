/**
 * The `(marketing)` route files against the module's tables.
 *
 * A metadata table is a second place a title lives, and the second place is the
 * one that goes stale: a page gets renamed, the table keeps the old string, and
 * the card starts advertising a page that no longer says that. Nothing fails.
 * So the tables are checked against the routes and static files themselves —
 * read off disk, not against a list this file maintains.
 *
 * What it holds us to:
 *   · every marketing route that renders a <title> has a row, and says the same
 *     thing in it
 *   · nothing emits a <meta name="description"> of its own: the layout already
 *     does, and two of them is a duplicate
 *   · the image the share tags point at is a real file of the declared size
 *   · every icon the features page names is in the icon set
 *
 * Reading files keeps these checks out of the pure rules tests (R4): this is the
 * http layer's proof that the pages and the tables agree.
 *
 * Doc: ./README.md#invariants
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURE_ICON_NAMES } from './marketing.icons.rules';
import { MARKETING_PAGES, SITE } from './marketing.seo.rules';

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

describe('the image the tags point at', () => {
	it('exists, and is the size the tags claim', () => {
		const file = join(process.cwd(), 'static', SITE.image.replace(/^\//, ''));
		expect(existsSync(file), `${SITE.image} is missing — run: npm run brand:build`).toBe(true);
		const { width, height } = readPngSize(file);
		expect([width, height]).toEqual([1200, 630]);
		expect([SITE.imageWidth, SITE.imageHeight]).toEqual([1200, 630]);
	});
});

describe('the features page', () => {
	it('every icon name in the pages is in the set', () => {
		const source = readFileSync(
			join(process.cwd(), 'src', 'routes', '(marketing)', 'features', '+page.svelte'),
			'utf8'
		);
		const used = [...source.matchAll(/\bicon:\s*'([a-z]+)'/g)].map((match) => match[1]);
		// The scan must find the page's icons at all, or the loop below proves nothing.
		expect(used.length).toBeGreaterThan(0);
		for (const name of used) {
			const known = FEATURE_ICON_NAMES.some((candidate) => candidate === name);
			expect(known, `${name} is not an icon`).toBe(true);
		}
	});
});

/** width/height out of the IHDR chunk — the one PNG header field that is fixed. */
function readPngSize(file: string): { width: number; height: number } {
	const buf = readFileSync(file);
	if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
