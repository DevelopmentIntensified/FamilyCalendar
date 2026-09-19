import { describe, it, expect } from 'vitest';
import {
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
			'/family'
		]);
	});
});
