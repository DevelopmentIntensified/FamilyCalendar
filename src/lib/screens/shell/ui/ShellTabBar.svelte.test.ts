/**
 * The phone tab bar as a user sees it: six destinations in one order, the
 * Alerts badge with its untruncated accessible name, the Calendar escape hatch
 * still highlighted on a subroute, and the class-only hide while a keyboard is
 * open (the bar must stay in the document for assistive tech).
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import ShellTabBar from './ShellTabBar.svelte';

afterEach(cleanup);

function tabLabels(): string[] {
	const nav = screen.getByRole('navigation', { name: 'Primary navigation' });
	return within(nav)
		.getAllByRole('link')
		.map((link) => (link.textContent ?? '').replace(/\s+/g, ' ').trim());
}

describe('ShellTabBar', () => {
	it('names the Alerts tab with its unread count', () => {
		render(ShellTabBar, { props: { pathname: '/calendar/dashboard', unreadCount: 3 } });
		const alerts = screen.getByRole('link', { name: 'Alerts (3 unread)' });
		expect(alerts).toHaveAttribute('href', '/calendar/notifications');
		expect(alerts).toHaveTextContent('3');
	});

	it('shows the six destinations and the Groceries short label', () => {
		render(ShellTabBar, { props: { pathname: '/calendar', unreadCount: 0 } });
		expect(tabLabels()).toEqual(['Calendar', 'Dashboard', 'Tasks', 'Shop', 'Alerts', 'Family']);
	});

	it('marks the longest matching destination, not the first prefix', () => {
		render(ShellTabBar, { props: { pathname: '/calendar/tasks/abc', unreadCount: 0 } });
		expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
		expect(screen.getByRole('link', { name: 'Calendar' })).not.toHaveAttribute('aria-current');
	});

	it('hides without unmounting while the on-screen keyboard is open', async () => {
		Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
		Object.defineProperty(window, 'visualViewport', {
			configurable: true,
			value: {
				height: 400,
				addEventListener: () => {},
				removeEventListener: () => {}
			}
		});
		try {
			render(ShellTabBar, { props: { pathname: '/calendar', unreadCount: 0 } });
			await tick();
			const nav = screen.getByRole('navigation', { name: 'Primary navigation' });
			expect(nav.className).toContain('pointer-events-none');
			expect(nav.className).toContain('opacity-0');
			expect(nav).toBeInTheDocument();
		} finally {
			Reflect.deleteProperty(window, 'visualViewport');
		}
	});
});
