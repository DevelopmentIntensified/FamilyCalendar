// The page catalog: every legacy page route, grouped by the module that will
// own its rebuild. `npx playwright test -c playwright.pages.config.ts --list`
// lists each entry once per project; visual.spec.ts screenshots them.
//
// Source of truth for the route list: `npm run census` (scripts/arch/
// legacy-map.json), entries whose kind is "route" and whose file is a
// `+page.svelte`. Keep this file a list of routes, not of components: a page
// that stops being a route leaves the catalog with it.
//
// `ready` is the selector that means the page is usable — an existing
// data-testid wherever the page has one, else its heading. `mask` hides
// regions that change on their own; today every clock-derived value a page
// can show is pinned by its seed, so no entry needs one (see README.md).
//
// Doc: e2e/pages/README.md
import type { SeedName } from './seeds';

export type PageEntry = {
	module: string;
	/** Stable, unique within its module: the screenshot's file name. */
	name: string;
	/** The route, with `[param]` fill-ins taken from the seed's params. */
	path: string;
	seed: SeedName;
	/** Selector that appears once the page is usable. */
	ready: string;
	/** Selectors of self-changing regions, hidden before the screenshot. */
	mask?: string[];
};

export const PAGES: PageEntry[] = [
	// --- admin -------------------------------------------------------------
	{
		module: 'admin',
		name: 'admin-home',
		path: '/admin',
		seed: 'adminRegisters',
		ready: 'h1'
	},

	// --- feedback ----------------------------------------------------------
	{
		module: 'feedback',
		name: 'admin-bugs',
		path: '/admin/bugs',
		seed: 'adminRegisters',
		ready: 'h1'
	},
	{
		module: 'feedback',
		name: 'admin-nlp',
		path: '/admin/nlp',
		seed: 'adminRegisters',
		ready: 'h1'
	},
	{
		module: 'feedback',
		name: 'report-bug',
		path: '/report-bug',
		seed: 'accountUser',
		ready: 'h1'
	},

	// --- account -----------------------------------------------------------
	{
		module: 'account',
		name: 'account-settings',
		path: '/account',
		seed: 'accountUser',
		ready: '[data-testid="account-rail"]'
	},

	// --- access ------------------------------------------------------------
	{
		module: 'access',
		name: 'verify-email',
		path: '/account/verify-email',
		seed: 'accountUser',
		ready: 'h1'
	},
	{
		module: 'access',
		name: 'claim',
		path: '/claim',
		seed: 'guestUser',
		ready: 'h1'
	},
	{
		module: 'access',
		name: 'merge-guest',
		path: '/merge-guest',
		seed: 'mergeGuestUser',
		ready: 'h1'
	},
	{
		module: 'access',
		name: 'invite-email',
		path: '/family/invite/email?token=[token]',
		seed: 'inviteEmail',
		ready: 'h1'
	},
	{
		module: 'access',
		name: 'forgot-password',
		path: '/forgot-password',
		seed: 'publicPages',
		ready: 'h1'
	},
	{
		module: 'access',
		name: 'reset-password',
		path: '/forgot-password/reset',
		seed: 'publicPages',
		ready: 'h1'
	},
	{
		module: 'access',
		name: 'login',
		path: '/login',
		seed: 'publicPages',
		ready: 'h1'
	},
	{
		module: 'access',
		name: 'signup',
		path: '/signup',
		seed: 'publicPages',
		ready: 'h1'
	},

	// --- calendarPage ------------------------------------------------------
	{
		module: 'calendarPage',
		name: 'calendar-month',
		path: '/calendar',
		seed: 'calendarUser',
		ready: '[data-testid="calendar-card"]'
	},
	{
		// Redirect-only route: it hands the shared text to /calendar and lands
		// there, so the screenshot is the calendar the share produced.
		module: 'calendarPage',
		name: 'share-target',
		path: '/share-target',
		seed: 'calendarUser',
		ready: '[data-testid="calendar-card"]'
	},

	// --- tasks -------------------------------------------------------------
	{
		module: 'tasks',
		name: 'archive',
		path: '/calendar/archive',
		seed: 'calendarUser',
		ready: '[data-testid="archive-layout"]'
	},
	{
		module: 'tasks',
		name: 'stats',
		path: '/calendar/stats',
		seed: 'calendarUser',
		ready: '[data-testid="streak-hero"]'
	},
	{
		module: 'tasks',
		name: 'tasks',
		path: '/calendar/tasks',
		seed: 'calendarUser',
		ready: '#tasks-heading'
	},

	// --- dayDashboard ------------------------------------------------------
	{
		module: 'dayDashboard',
		name: 'dashboard',
		path: '/calendar/dashboard',
		seed: 'calendarUser',
		ready: 'h1'
	},

	// --- calendar ----------------------------------------------------------
	{
		module: 'calendar',
		name: 'event-detail',
		path: '/calendar/event/[id]',
		seed: 'calendarUser',
		ready: 'h1'
	},
	{
		module: 'calendar',
		name: 'import',
		path: '/calendar/import',
		seed: 'calendarUser',
		ready: '[data-testid="import-drop-zone"]'
	},
	{
		module: 'calendar',
		name: 'print',
		path: '/calendar/print',
		seed: 'calendarUser',
		ready: 'h1'
	},

	// --- groceries ---------------------------------------------------------
	{
		module: 'groceries',
		name: 'groceries',
		path: '/calendar/groceries',
		seed: 'groceriesUser',
		ready: '[data-testid="grocery-layout"]'
	},

	// --- alerts ------------------------------------------------------------
	{
		module: 'alerts',
		name: 'notifications',
		path: '/calendar/notifications',
		seed: 'calendarUser',
		ready: '[data-testid="unread-count"]'
	},

	// --- family ------------------------------------------------------------
	{
		module: 'family',
		name: 'families',
		path: '/family',
		seed: 'familyUser',
		ready: 'h1'
	},
	{
		module: 'family',
		name: 'family-members-add',
		path: '/family/[familyId]/members/add',
		seed: 'familyUser',
		ready: 'h1'
	},
	{
		module: 'family',
		name: 'family-create',
		path: '/family/create',
		seed: 'accountUser',
		ready: 'h1'
	},
	{
		module: 'family',
		name: 'family-invitations',
		path: '/family/invitations',
		seed: 'familyUser',
		ready: 'h1'
	},
	{
		module: 'family',
		name: 'family-join',
		path: '/family/join/[code]',
		seed: 'familyInvite',
		ready: 'h1'
	},

	// --- familyHub ---------------------------------------------------------
	{
		module: 'familyHub',
		name: 'family-hub',
		path: '/family/[familyId]',
		seed: 'familyUser',
		ready: 'h1'
	},
	{
		module: 'familyHub',
		name: 'family-tasks',
		path: '/family/tasks',
		seed: 'familyUser',
		ready: 'h1'
	},

	// --- marketing ---------------------------------------------------------
	{
		module: 'marketing',
		name: 'home',
		path: '/',
		seed: 'publicPages',
		ready: 'h1'
	},
	{
		module: 'marketing',
		name: 'about',
		path: '/about',
		seed: 'publicPages',
		ready: 'h1'
	},
	{
		module: 'marketing',
		name: 'android',
		path: '/android',
		seed: 'publicPages',
		ready: 'h1'
	},
	{
		module: 'marketing',
		name: 'changelog',
		path: '/changelog',
		seed: 'publicPages',
		ready: 'h1'
	},
	{
		module: 'marketing',
		name: 'contact',
		path: '/contact',
		seed: 'publicPages',
		ready: 'h1'
	},
	{
		module: 'marketing',
		name: 'features',
		path: '/features',
		seed: 'publicPages',
		ready: 'h1'
	},
	{
		module: 'marketing',
		name: 'privacy',
		path: '/privacy',
		seed: 'publicPages',
		ready: 'h1'
	},
	{
		module: 'marketing',
		name: 'roadmap',
		path: '/roadmap',
		seed: 'publicPages',
		ready: 'h1'
	},
	{
		module: 'marketing',
		name: 'waitlist',
		path: '/waitlist',
		seed: 'publicPages',
		ready: 'h1'
	},

	// --- billing -----------------------------------------------------------
	{
		module: 'billing',
		name: 'checkout',
		path: '/checkout?plan=monthly',
		seed: 'accountUser',
		ready: 'h1'
	},
	{
		module: 'billing',
		name: 'pricing',
		path: '/pricing',
		seed: 'publicPages',
		ready: 'h1'
	}
];

/** Modules the catalog covers, in catalog order. */
export function catalogModules(): string[] {
	return [...new Set(PAGES.map((entry) => entry.module))];
}

/**
 * The pages to run: `PAGES_MODULE` narrows to one module, unset means all.
 * An unknown module name fails loudly rather than silently running nothing.
 */
export function pagesForModule(moduleName: string | undefined): PageEntry[] {
	if (!moduleName) return PAGES;
	const pages = PAGES.filter((entry) => entry.module === moduleName);
	if (pages.length === 0) {
		throw new Error(
			`PAGES_MODULE="${moduleName}" matches no catalog page. Known modules: ${catalogModules().join(', ')}`
		);
	}
	return pages;
}

/**
 * Fill a route template from the seed's params: `[id]`, `[familyId]`, `[code]`
 * and — because a link-borne credential can only travel in the query — the
 * `[token]` of the invite email. An unfilled placeholder is a seed bug, so it
 * fails here instead of navigating to a literal `[id]` URL.
 */
export function resolvePath(path: string, params: Record<string, string> | undefined): string {
	return path.replace(/\[(\w+)\]/g, (placeholder: string, key: string) => {
		const value = params?.[key];
		if (value === undefined) {
			throw new Error(`Page path "${path}" needs param "${key}" and the seed did not return it.`);
		}
		return encodeURIComponent(value);
	});
}
