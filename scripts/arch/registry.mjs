// THE module registry: single source of truth for module names, dependency
// ranks, table ownership and port order. Read by every scripts/arch tool and
// rendered into docs/architecture/modules.md (`npm run docs:gen`).
//
// Change this file only as part of a ledger task that says so
// (docs/rewrite/LEDGER.md). Doc: docs/architecture/README.md

/**
 * kind:
 *   kernel  - platform toolkit, no domain words (src/lib/kernel)
 *   domain  - one business area: rules, repo, service, http, ui (src/lib/domains/<name>)
 *   screen  - a page that composes 2+ domains (src/lib/screens/<name>)
 *   app     - composition root: hooks wiring, cron, health (src/lib/app)
 *
 * rank (domains only): a domain may import ONLY domains with a LOWER rank.
 * Screens may import any domain, never another screen. app imports anything.
 */
export const MODULES = [
	{
		name: 'kernel',
		kind: 'kernel',
		purpose:
			'Platform toolkit: ctx ports (db, clock, ids, log, limiter, faults), errors, validation, HTTP builders, test harness, shared client/UI primitives.'
	},
	{
		name: 'identity',
		kind: 'domain',
		rank: 1,
		purpose:
			'Users, sessions and session cookies, personal API tokens (fp_), user settings incl. time zone, Anonymous Account detection, email codes, password hashing.'
	},
	{
		name: 'billing',
		kind: 'domain',
		rank: 2,
		purpose:
			'Plans, subscriptions, plan limits (family size, archive), discounts, checkout stub, AI spend cap and usage.'
	},
	{
		name: 'alerts',
		kind: 'domain',
		rank: 3,
		purpose:
			'The Alert feed (closed type set, needs-you vs news), notification preferences, web push subscriptions, Android device tokens and push fan-out.'
	},
	{
		name: 'family',
		kind: 'domain',
		rank: 4,
		purpose:
			'Families, Family Members (role vs Member Type), invite codes and email/link invites, roster, member search, child consent records.'
	},
	{
		name: 'dashboardModules',
		kind: 'domain',
		rank: 5,
		purpose:
			'Dashboard Module registry, family master switches, per-user hides, the one visibility answer.'
	},
	{
		name: 'bills',
		kind: 'domain',
		rank: 6,
		parked: true,
		purpose:
			'PARKED (bills archived 2026-09-25): bill category vocabulary + bills/receiptItems/itemTags tables only.'
	},
	{
		name: 'parsing',
		kind: 'domain',
		rank: 7,
		purpose:
			'Natural-language grammars: event quick-add, task quick-add (shared parse vectors with Android), bill hints, date vocabulary, the claim book.'
	},
	{
		name: 'calendar',
		kind: 'domain',
		rank: 8,
		purpose:
			'Calendars, Events, Recurring Event expansion, Exception Overrides, family mirrors, attendance/RSVP, ICS import/export, bulk edits, event UI.'
	},
	{
		name: 'tasks',
		kind: 'domain',
		rank: 9,
		purpose:
			'Tasks: visibility, priority, assignment handoff, Recurring Task cursor, tags, categories, completions, stats/streaks, archive, TaskFocus focus time + phone sessions, task UI.'
	},
	{
		name: 'groceries',
		kind: 'domain',
		rank: 10,
		purpose: 'Grocery List (one list, scope filter), Grocery Items, Store Memory, Store Colours.'
	},
	{
		name: 'verse',
		kind: 'domain',
		rank: 11,
		purpose: 'Daily Verse: fetch, cache, translation, the verse card.'
	},
	{
		name: 'sponsored',
		kind: 'domain',
		rank: 12,
		purpose:
			'Sponsored Events: serve gate (showAdsAsEvents), month generation, impressions/clicks, consent records, blob assets.'
	},
	{
		name: 'meals',
		kind: 'domain',
		rank: 13,
		parked: true,
		purpose: 'PARKED (meals parked by owner): meals table, endpoint and card, ported as-is.'
	},
	{
		name: 'feedback',
		kind: 'domain',
		rank: 14,
		purpose:
			'Bug reports (user-filed and auto-filed faults), unmatched NLP phrases, the admin registers and their export.'
	},
	{
		name: 'access',
		kind: 'domain',
		rank: 15,
		purpose:
			'Sign-in flows: login, signup, magic links, password reset, Claiming, Claim Conflict merge, guest merge, email change/verify, mobile (Android) auth, logout.'
	},
	{
		name: 'marketing',
		kind: 'domain',
		rank: 16,
		purpose:
			'Public site: home, features, pricing display, roadmap/changelog, contact, waitlist, SEO tags, Android/F-Droid page.'
	},
	{
		name: 'shell',
		kind: 'screen',
		purpose:
			'App chrome: root + group layouts, nav bars, alert bell slot, offline banner, error page.'
	},
	{
		name: 'account',
		kind: 'screen',
		purpose:
			'The /account page: one section per domain (profile, calendar settings, notifications, plan, tokens, danger zone) + data export.'
	},
	{
		name: 'admin',
		kind: 'screen',
		purpose: 'Admin shell: tab layout and badge counts (registers themselves live in feedback).'
	},
	{
		name: 'familyHub',
		kind: 'screen',
		purpose:
			'The family detail page: roster + family tasks + dashboard module switches + recent activity.'
	},
	{
		name: 'dayDashboard',
		kind: 'screen',
		purpose:
			'The Day Dashboard: composes events, Top-3 Priorities, Family Task Board, Kids Schedule, groceries, Daily Verse.'
	},
	{
		name: 'calendarPage',
		kind: 'screen',
		purpose:
			'The main calendar page: month/week/day/list views, toolbar and filters, selection + bulk edit, create-anything modal.'
	},
	{
		name: 'app',
		kind: 'app',
		purpose:
			'Composition root: builds the production Ctx, session pipeline wiring in hooks, cron cleanup, health check.'
	}
];

/** Order the rewrite ports modules in (dependencies first). docs/rewrite/LEDGER.md mirrors it. */
export const PORT_ORDER = [
	'feedback',
	'identity',
	'billing',
	'alerts',
	'family',
	'dashboardModules',
	'bills',
	'parsing',
	'verse',
	'groceries',
	'meals',
	'sponsored',
	'calendar',
	'tasks',
	'access',
	'marketing',
	'shell',
	'account',
	'admin',
	'familyHub',
	'dayDashboard',
	'calendarPage',
	'app'
];

/** Drizzle table export name -> owning module. Only the owner's repo may write it. */
export const TABLE_OWNERS = {
	users: 'identity',
	userSettings: 'identity',
	accounts: 'identity',
	codes: 'identity',
	authSession: 'identity',
	authAccount: 'identity',
	authVerification: 'identity',
	apiTokens: 'identity',
	discounts: 'billing',
	userDiscounts: 'billing',
	subscriptions: 'billing',
	subscriptionTypes: 'billing',
	aiUsageTracking: 'billing',
	notifications: 'alerts',
	pushSubscriptions: 'alerts',
	deviceTokens: 'alerts',
	families: 'family',
	familyMembers: 'family',
	familyInviteCodes: 'family',
	childConsentRecords: 'family',
	dashboardModuleSwitches: 'dashboardModules',
	bills: 'bills',
	receiptItems: 'bills',
	itemTags: 'bills',
	calendars: 'calendar',
	events: 'calendar',
	eventExceptions: 'calendar',
	eventAttendance: 'calendar',
	tasks: 'tasks',
	taskTags: 'tasks',
	taskCompletions: 'tasks',
	taskCategories: 'tasks',
	taskfocusCommands: 'tasks',
	taskfocusSessions: 'tasks',
	groceryItems: 'groceries',
	groceryStoreMemory: 'groceries',
	groceryStoreColours: 'groceries',
	adEvents: 'sponsored',
	adConsentRecords: 'sponsored',
	meals: 'meals',
	bugReports: 'feedback',
	unmatchedPhrases: 'feedback',
	claimTokens: 'access',
	waitlist: 'marketing'
};

/**
 * Read-only JOINs a repo may make into tables another module owns (read
 * models only; writes always go through the owner's service). Add an entry in
 * the same commit as the repo that needs it, with the reason.
 */
export const FOREIGN_READS = {
	feedback: { users: 'reporter first/last name on the admin registers' },
	alerts: {
		subscriptions:
			'notification preferences live in activeSubscriptions.notificationMethods (legacy storage, no DDL)'
	}
};

/** Legacy code locations. New code must not import from them (rule R14) except via scripts/arch/legacy-bridges.json. */
export const LEGACY_PREFIXES = [
	'src/lib/server/',
	'src/lib/utils/',
	'src/lib/components/',
	'src/lib/client/',
	'src/lib/data/',
	'src/lib/admin/',
	'src/lib/marketing/',
	'src/lib/conformance/',
	'src/lib/types.ts',
	'src/lib/dashboardModules.ts'
];

/** File roles allowed inside domains/ and screens/ (rule R15). Doc: docs/architecture/conventions.md#file-roles */
export const FILE_ROLES = [
	'rules',
	'contract',
	'repo',
	'service',
	'http',
	'api',
	'state',
	'fixtures'
];

export function moduleByName(name) {
	return MODULES.find((module) => module.name === name) ?? null;
}

export function moduleDir(module) {
	if (module.kind === 'kernel') return 'src/lib/kernel';
	if (module.kind === 'app') return 'src/lib/app';
	return module.kind === 'screen'
		? `src/lib/screens/${module.name}`
		: `src/lib/domains/${module.name}`;
}
