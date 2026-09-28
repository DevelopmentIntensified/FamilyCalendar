import { describe, it, expect } from 'vitest';
import {
	bottomNavItems,
	loggedInNavItems,
	marketingNavItems,
	resolveActiveHref,
	type NavItem
} from './navItems';

describe('resolveActiveHref', () => {
	it('matches exact paths', () => {
		expect(resolveActiveHref('/calendar', loggedInNavItems)).toBe('/calendar?dashboardView=1');
	});

	it('matches query-carrying hrefs pathname-only (#056)', () => {
		const items: NavItem[] = [{ href: '/calendar?dashboardView=1', label: 'Calendar' }];
		expect(resolveActiveHref('/calendar', items)).toBe('/calendar?dashboardView=1');
		expect(resolveActiveHref('/other', items)).toBeNull();
	});

	it('lets the longest prefix win so /calendar/tasks highlights Tasks', () => {
		expect(resolveActiveHref('/calendar/tasks', loggedInNavItems)).toBe('/calendar/tasks');
		expect(resolveActiveHref('/calendar/tasks/abc', loggedInNavItems)).toBe(
			'/calendar/tasks'
		);
	});

	it('returns null when nothing matches', () => {
		expect(resolveActiveHref('/account', loggedInNavItems)).toBeNull();
		expect(resolveActiveHref('/', loggedInNavItems)).toBeNull();
	});

	it('does not match partial segments (/calendars ≠ /calendar)', () => {
		const items: NavItem[] = [{ href: '/calendar', label: 'Calendar' }];
		expect(resolveActiveHref('/calendars', items)).toBeNull();
	});

	it('ships the marketing + app item sets', () => {
		expect(marketingNavItems.map((i) => i.href)).toEqual([
			'/features',
			'/pricing',
			'/about',
			'/contact'
		]);
		expect(loggedInNavItems.map((i) => i.href)).toEqual([
			'/calendar?dashboardView=1',
			'/calendar/dashboard',
			'/calendar/tasks',
			'/calendar/groceries',
			'/family'
		]);
	});
});

describe('the two navs come from one list (issue 065)', () => {
	it('reaches groceries from the tab bar, not just the desktop nav', () => {
		expect(bottomNavItems.map((i) => i.href)).toContain('/calendar/groceries');
	});

	it('keeps alerts in the tab bar — the bell is desktop-only', () => {
		expect(bottomNavItems.map((i) => i.href)).toContain('/calendar/notifications');
	});

	it('never hides a destination from the tab bar that the desktop nav shows', () => {
		// The one permitted difference is the one the bell explains.
		const bellOnly = bottomNavItems.filter((i) => !loggedInNavItems.includes(i));
		expect(bellOnly.map((i) => i.href)).toEqual(['/calendar/notifications']);
	});

	it('gives every tab an icon and a label that fits a 320px bar', () => {
		for (const item of bottomNavItems) {
			expect(item.icon, `${item.label} has no icon`).toBeTruthy();
			const label = item.shortLabel ?? item.label;
			// 320px / 6 tabs ≈ 53px per tab; an 11px label fits ~9 characters.
			expect(label.length, `${item.label} is too long for the tab bar`).toBeLessThanOrEqual(9);
		}
	});

	it('resolves the active tab for a grocery-list visit', () => {
		expect(resolveActiveHref('/calendar/groceries', bottomNavItems)).toBe('/calendar/groceries');
		expect(resolveActiveHref('/calendar/groceries/abc', bottomNavItems)).toBe(
			'/calendar/groceries'
		);
	});
});
