/**
 * The `(marketing)` route files and the module's screens against the tables.
 *
 * A metadata table is a second place a title lives, and the second place is the
 * one that goes stale. Since S7 the pages render `pageTitle(path)` — the row's
 * own string — so a ported page cannot advertise one title and show another
 * (Q-069: the home page used to), and the root is covered because the check
 * walks the module's screens, not the route directories.
 *
 * What it holds us to:
 *   · every screen names its own path, that path has a row and a route file,
 *     and the route renders that screen
 *   · a page still carrying its own `<title>` (the pages identity and billing
 *     still own) says what its row says
 *   · nothing emits a `<meta name="description">` of its own: the shell already
 *     does, and two of them is a duplicate
 *   · the layout hands the signed-in person to the navbar (issue 254)
 *   · the image the share tags point at is a real file of the declared size
 *   · every icon the features page names is in the icon set
 *
 * Reading files keeps these checks out of the pure rules tests (R4).
 *
 * Doc: ./README.md#invariants
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURE_ICON_NAMES } from './marketing.icons.rules';
import { MARKETING_PAGES, SITE } from './marketing.seo.rules';

const routesRoot = join(process.cwd(), 'src', 'routes', '(marketing)');
const uiRoot = join(process.cwd(), 'src', 'lib', 'domains', 'marketing', 'ui');

/** The module's page screens: one per `(marketing)` route the module owns. */
function screenNames(): string[] {
	return readdirSync(uiRoot)
		.filter((name) => /^[A-Z][A-Za-z]*Screen\.svelte$/.test(name))
		.sort();
}

/** The pathname a screen declares, from its one `pageTitle('/…')` call. */
function declaredPath(screen: string): string {
	const source = readFileSync(join(uiRoot, screen), 'utf8');
	const found = [...source.matchAll(/pageTitle\('([^']*)'\)/g)].map((match) => match[1]);
	expect(found, `${screen} must call pageTitle exactly once`).toHaveLength(1);
	return found[0];
}

/** The `+page.svelte` that serves `pathname`. */
function routeFile(pathname: string): string {
	return pathname === '/'
		? join(routesRoot, '+page.svelte')
		: join(routesRoot, pathname.replace(/^\//, ''), '+page.svelte');
}

/** Directories under `(marketing)` that hold a `+page.svelte`, minus the groups that are not site pages. */
function marketingRoutes(): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(routesRoot, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		if (entry.name === 'family' || entry.name === 'join' || entry.name === 'invite') continue;
		if (existsSync(join(routesRoot, entry.name, '+page.svelte'))) found.push(entry.name);
	}
	return found.sort();
}

describe('the screens and the routes', () => {
	const screens = screenNames();

	it('finds the module’s screens at all', () => {
		expect(screens.length).toBeGreaterThan(7);
	});

	it.each(screens)('%s declares a path with a row and a route that renders it', (screen) => {
		const pathname = declaredPath(screen);
		const row = MARKETING_PAGES[pathname];
		expect(row, `${screen} says '${pathname}', which has no row in MARKETING_PAGES`).toBeDefined();
		expect(row?.title.length ?? 0).toBeGreaterThan(0);

		const file = routeFile(pathname);
		expect(existsSync(file), `${pathname} has a screen but no route file`).toBe(true);
		const source = readFileSync(file, 'utf8');
		expect(source).toContain(screen.replace(/\.svelte$/, ''));
	});

	it('covers the root: a page for / exists and renders its own screen', () => {
		const home = screens.filter((screen) => declaredPath(screen) === '/');
		expect(home).toHaveLength(1);
	});

	it('every ported page renders its title from the table, not a second literal', () => {
		for (const screen of screens) {
			const source = readFileSync(join(uiRoot, screen), 'utf8');
			expect(source, `${screen} must render pageTitle(...)`).toMatch(/<title>\{pageTitle\('/);
			expect(source, `${screen} must not emit its own description`).not.toMatch(
				/<meta[^>]*name=["']description["']/
			);
		}
	});
});

describe('the pages that are not ported yet', () => {
	const routes = marketingRoutes();

	it('finds the marketing routes at all', () => {
		expect(routes.length).toBeGreaterThan(10);
	});

	it.each(routes)('/%s says what its row says, when it sets a title', (route) => {
		const source = readFileSync(join(routesRoot, route, '+page.svelte'), 'utf8');
		const title = source.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
		// A ported page has no title of its own (its screen renders pageTitle).
		if (!title) return;
		const row = MARKETING_PAGES[`/${route}`];
		expect(row, `/${route} sets a <title> but has no row in MARKETING_PAGES`).toBeDefined();
		expect(row?.title).toBe(title);
		// A description has to earn its place in a SERP listing, so the floor only
		// applies to pages that are actually indexed.
		if (!row?.noindex) {
			expect(row?.description.length ?? 0).toBeGreaterThan(40);
		}
	});

	it.each(routes)('/%s does not emit its own description', (route) => {
		const source = readFileSync(join(routesRoot, route, '+page.svelte'), 'utf8');
		// The shell emits one for every route; a second is a duplicate, and a
		// crawler picks whichever it likes.
		expect(source).not.toMatch(/<meta[^>]*name=["']description["']/);
	});

	it('the layout hands the signed-in person to the navbar (issue 254)', () => {
		const source = readFileSync(join(routesRoot, '+layout.svelte'), 'utf8');
		expect(source).toContain('isLoggedIn={data.isLoggedIn}');
		expect(source).toContain('user={data.user}');
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
	it('every icon name in the page is in the set', () => {
		const source = readFileSync(join(uiRoot, 'FeaturesScreen.svelte'), 'utf8');
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
