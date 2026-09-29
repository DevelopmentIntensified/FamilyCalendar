/**
 * Issue 064 — family links.
 *
 * The prototype claimed every family link 404s because it renders
 * `href="/family/{family.id}"` and "the braces ship literally". They do not:
 * in Svelte markup an attribute value with a mustache tag interpolates. The
 * two that really were broken were a JS string used as an href, and an href
 * naming a route the router does not have.
 *
 * So this suite pins the rule rather than the incident: an href may contain
 * braces only if something interpolates them, and every static href must name
 * a route that exists. Both halves are static analysis of the real sources —
 * a link bug is a link bug in a link.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'svelte/compiler';
import { bottomNavItems, loggedInNavItems } from '$lib/utils/navItems';

const REPO = join(process.cwd(), 'src');
const ROUTES = join(REPO, 'routes');

/** Every .svelte file under src/. */
function svelteFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return svelteFiles(full);
		return full.endsWith('.svelte') ? [full] : [];
	});
}

/**
 * Every route path the router serves, e.g. /family/[familyId]/members/add.
 * A directory that contains a +page file IS a route. Route groups
 * ((calendar), (family)) are walked into but add no path segment, which is
 * what the router does with them.
 */
function routePaths(dir: string = ROUTES, prefix = ''): string[] {
	const entries = readdirSync(dir);
	const out: string[] = [];
	if (entries.some((e) => /^\+page\.(svelte|ts|js)$/.test(e))) out.push(prefix || '/');
	for (const entry of entries) {
		const full = join(dir, entry);
		if (!statSync(full).isDirectory()) continue;
		// A group is invisible in the URL; an underscore dir is not routed at all.
		if (entry.startsWith('_')) continue;
		const seg = entry.startsWith('(') ? '' : `/${entry}`;
		out.push(...routePaths(full, `${prefix}${seg}`));
	}
	return out;
}

const ROUTE_PATHS = routePaths();

/**
 * Pages that only render while signed out, and the app's own error page.
 * Their links point at sign-in surfaces deliberately, so the auth-gate check
 * below is about the app's own routes — not "can a logged-out visitor click
 * this".
 */
const PUBLIC_PAGES = new Set([
	join(ROUTES, '+error.svelte'),
	join(ROUTES, 'report-bug', '+page.svelte'),
	join(ROUTES, 'share-target', '+page.svelte'),
	...svelteFiles(join(ROUTES, '(marketing)'))
]);

/** Does this static href match a real route? Dynamic segments match anything. */
function hrefResolves(href: string): boolean {
	const path = href.split('#')[0].split('?')[0];
	if (!path.startsWith('/')) return true; // mailto:, tel:, external — out of scope
	return ROUTE_PATHS.some((route) => {
		const r = route.split('/').filter(Boolean);
		const p = path.split('/').filter(Boolean);
		if (r.length !== p.length) return false;
		return r.every((seg, i) => seg.startsWith('[') || seg === p[i]);
	});
}

describe('every href in the app', () => {
	const files = svelteFiles(REPO);

	it('finds the sources it is meant to be checking', () => {
		// A suite that silently checks nothing is worse than no suite.
		expect(files.length).toBeGreaterThan(50);
		expect(ROUTE_PATHS.length).toBeGreaterThan(20);
	});

	it('never ships literal braces in a rendered href', () => {
		const offenders: string[] = [];
		for (const file of files) {
			const src = readFileSync(file, 'utf8');
			const ast = parse(src);
			const walk = (node: unknown): void => {
				if (!node || typeof node !== 'object') return;
				if (Array.isArray(node)) return void node.forEach(walk);
				const n = node as Record<string, unknown>;
				if (n.type === 'Attribute' && n.name === 'href') {
					const parts = (n.value ?? []) as { type: string; raw?: string }[];
					const interpolated = parts.some((p) => p.type === 'MustacheTag');
					const text = parts.map((p) => p.raw ?? '').join('');
					if (!interpolated && /[{}]/.test(text)) {
						offenders.push(`${relative(REPO, file)}: ${text}`);
					}
				}
				for (const [k, v] of Object.entries(n)) {
					if (k !== 'parent') walk(v);
				}
			};
			walk(ast.html ?? ast.fragment ?? ast);
		}
		expect(offenders).toEqual([]);
		// Compiles every .svelte file under src/ with the Svelte parser. ~2s on
		// its own, and it blows the default 5s timeout whenever it runs
		// alongside a full parallel suite. Whole-repo static analysis is
		// legitimately slow — give it room rather than let it flake.
	}, 60_000);

	it('never builds an href as a plain JS string with braces in it', () => {
		// A quoted string never interpolates, so '{id}' ships as literal text.
		// Template literals (`${id}`) are the correct form and are skipped.
		const offenders: string[] = [];
		const pattern = /(?:href|action)\s*[:=]\s*(['"])([^'"]*[{}][^'"]*)\1/g;
		for (const file of files) {
			const src = readFileSync(file, 'utf8');
			for (const script of src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
				for (const m of script[1].matchAll(pattern)) {
					offenders.push(`${relative(REPO, file)}: ${m[2]}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it('resolves every destination in both navs to a real route', () => {
		// A nav item pointing at a page that does not exist is the same class of
		// dead link as a bad href, and the two navs drifting apart is how the
		// tab bar ended up missing Groceries (issue 065).
		const offenders: string[] = [];
		for (const item of [...loggedInNavItems, ...bottomNavItems]) {
			if (!hrefResolves(item.href)) offenders.push(item.href);
		}
		expect(offenders).toEqual([]);
	});

	it('keeps every nav destination reachable, in both navs', () => {
		// Alerts is the single documented exception: the desktop nav shows it as
		// a bell, so the tab bar owns it alone.
		const desktopOnly = loggedInNavItems.filter((i) => !bottomNavItems.includes(i));
		expect(desktopOnly).toEqual([]);
		const tabBarOnly = bottomNavItems.filter((i) => !loggedInNavItems.includes(i));
		expect(tabBarOnly.map((i) => i.href)).toEqual(['/calendar/notifications']);
	});

	it('only points at routes the router actually serves', () => {
		const offenders: string[] = [];
		// Signed-out pages legitimately link to /login, /signup and friends.
		const files = svelteFiles(REPO).filter((f) => !PUBLIC_PAGES.has(f));
		for (const file of files) {
			const src = readFileSync(file, 'utf8');
			const ast = parse(src);
			const walk = (node: unknown): void => {
				if (!node || typeof node !== 'object') return;
				if (Array.isArray(node)) return void node.forEach(walk);
				const n = node as Record<string, unknown>;
				if (n.type === 'Attribute' && n.name === 'href') {
					const parts = (n.value ?? []) as { type: string; raw?: string }[];
					// Only a fully static href can be resolved without rendering.
					// A dynamic one is a real limitation of this check, not an
					// exemption: `/family/{id}/invitations` interpolated fine and
					// still 404'd, which is why the family links are also pinned
					// by name in the last test.
					if (parts.some((p) => p.type === 'MustacheTag')) return;
					const staticHref = parts.map((p) => p.raw ?? '').join('');
					if (staticHref && !hrefResolves(staticHref)) {
						offenders.push(`${relative(REPO, file)}: ${staticHref}`);
					}
				}
				for (const [k, v] of Object.entries(n)) {
					if (k !== 'parent') walk(v);
				}
			};
			walk(ast.html ?? ast.fragment ?? ast);
		}
		expect(offenders).toEqual([]);
		// Same whole-repo parse as above — see the note on the first one.
	}, 60_000);

	it('keeps the two family links this issue fixed working', () => {
		// Named so a future regression names itself.
		const detail = readFileSync(
			join(ROUTES, '(family)', 'family', '[familyId]', '+page.svelte'),
			'utf8'
		);
		// The per-family invitations path never existed; invitations is one route.
		expect(detail).toContain('href="/family/invitations"');
		expect(detail).not.toContain('{family?.id}/invitations');

		const tasks = readFileSync(
			join(ROUTES, '(family)', 'family', '[familyId]', 'tasks', '+page.svelte'),
			'utf8'
		);
		expect(tasks).toContain('href: `/family/${data.family?.id}`');
	});
});
