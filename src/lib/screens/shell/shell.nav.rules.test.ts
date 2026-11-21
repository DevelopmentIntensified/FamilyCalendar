/**
 * Pure navigation rules, carried from the legacy table
 * (`src/lib/utils/navItems.test.ts`) and the legacy list
 * (`src/lib/utils/navItems.ts:35-92`). Expected values are the legacy
 * destinations and their order, never this code's output.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { shellActiveHref, shellNavItems } from './shell.nav.rules';

const tabHrefs = shellNavItems.map((item) => item.href);
const desktopHrefs = shellNavItems.filter((item) => !item.bellInstead).map((item) => item.href);

describe('ships the six app destinations in one list', () => {
	it('lists every destination once, in the legacy order', () => {
		expect(tabHrefs).toEqual([
			'/calendar?dashboardView=1',
			'/calendar/dashboard',
			'/calendar/tasks',
			'/calendar/groceries',
			'/calendar/notifications',
			'/family'
		]);
		expect(new Set(tabHrefs).size).toBe(6);
		expect(shellNavItems.map((item) => item.label)).toEqual([
			'Calendar',
			'Dashboard',
			'Tasks',
			'Groceries',
			'Alerts',
			'Family'
		]);
	});
});

describe('keeps Alerts in the tab bar and off the desktop links', () => {
	it('never hides a destination from the tab bar that the desktop nav shows', () => {
		// The one permitted difference is the one the bell explains (issue 065).
		const bellOnly = shellNavItems.filter((item) => !desktopHrefs.includes(item.href));
		expect(bellOnly.map((item) => item.href)).toEqual(['/calendar/notifications']);
		expect(desktopHrefs).toEqual([
			'/calendar?dashboardView=1',
			'/calendar/dashboard',
			'/calendar/tasks',
			'/calendar/groceries',
			'/family'
		]);
	});
});

describe('gives every tab an icon and a label that fits a 320 px bar', () => {
	it('keeps every glyph and caps the short label at nine characters', () => {
		for (const item of shellNavItems) {
			expect(item.icon, `${item.label} has no icon`).toBeTruthy();
			// 320 px / 6 tabs ≈ 53 px per tab; an 11 px label fits ~9 characters.
			expect((item.shortLabel ?? item.label).length, `${item.label} is too long`).toBeLessThanOrEqual(
				9
			);
		}
		// The short label never replaces the accessible name, which is the full label.
		const groceries = shellNavItems.find((item) => item.href === '/calendar/groceries');
		expect(groceries?.shortLabel).toBe('Shop');
		expect(groceries?.label).toBe('Groceries');
	});
});

describe('longest prefix wins and partial segments do not match', () => {
	it.each<{ what: string; pathname: string; expected: string | null }>([
		{
			what: 'the query-carrying Calendar escape hatch, compared pathname-only',
			pathname: '/calendar',
			expected: '/calendar?dashboardView=1'
		},
		{ what: 'a trailing slash', pathname: '/calendar/', expected: '/calendar?dashboardView=1' },
		{ what: 'the Dashboard page', pathname: '/calendar/dashboard', expected: '/calendar/dashboard' },
		{
			what: 'a Dashboard subroute',
			pathname: '/calendar/dashboard/board',
			expected: '/calendar/dashboard'
		},
		{ what: 'the Tasks page', pathname: '/calendar/tasks', expected: '/calendar/tasks' },
		{ what: 'a Task detail page', pathname: '/calendar/tasks/abc', expected: '/calendar/tasks' },
		{
			what: 'a grocery list',
			pathname: '/calendar/groceries/abc',
			expected: '/calendar/groceries'
		},
		{
			what: 'the Alerts page',
			pathname: '/calendar/notifications',
			expected: '/calendar/notifications'
		},
		{ what: 'the Family page', pathname: '/family', expected: '/family' },
		{ what: 'a family member page', pathname: '/family/invite', expected: '/family' },
		{ what: 'a partial segment after /calendar', pathname: '/calendars', expected: null },
		{ what: 'a longer segment after /calendar', pathname: '/calendarfoo', expected: null },
		{ what: 'a partial segment after /family', pathname: '/familyfoo', expected: null },
		{ what: 'a page outside the app', pathname: '/account', expected: null },
		{ what: 'the site root', pathname: '/', expected: null },
		{ what: 'an empty pathname', pathname: '', expected: null }
	])('$what', ({ pathname, expected }) => {
		expect(shellActiveHref(pathname)).toBe(expected);
	});
});
