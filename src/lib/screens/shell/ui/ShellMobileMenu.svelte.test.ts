/**
 * The phone menu: guest CTAs vs the member's account rows, the destination list
 * without Alerts (the bell row represents it), the active highlight, and the
 * focus trap the legacy menu never applied.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import type { ShellUserSummary } from '../shell.contract';
import ShellMobileMenu from './ShellMobileMenu.svelte';

afterEach(cleanup);

function summary(): ShellUserSummary {
	return {
		id: 'user-1',
		firstName: 'Mia',
		lastName: 'Rivera',
		email: 'mia@example.test',
		isAdmin: false,
		emailVerified: true,
		lastActiveAt: null
	};
}

function renderMenu(props: { user: ShellUserSummary | null; activeHref?: string | null }) {
	return render(ShellMobileMenu, {
		props: {
			user: props.user,
			activeHref: props.activeHref ?? null,
			reportBugHref: '/report-bug?from=%2Fcalendar',
			onNavigate: () => {},
			onLogoutSubmit: () => {}
		}
	});
}

describe('ShellMobileMenu', () => {
	it('shows the sign-in CTAs for guests and the account rows for members', () => {
		renderMenu({ user: null });
		expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login');
		expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute('href', '/signup');
		expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull();
		cleanup();

		renderMenu({ user: { ...summary(), isAdmin: true } });
		expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
		for (const name of ['Settings', 'Task Stats', 'Archive', 'Report a Bug', 'Admin', 'Bug Reports']) {
			expect(screen.getByRole('link', { name })).toBeInTheDocument();
		}
		expect(screen.queryByRole('link', { name: 'Sign In' })).toBeNull();
	});

	it('lists the destinations without Alerts and highlights the active one', () => {
		renderMenu({ user: summary(), activeHref: '/calendar/tasks' });
		const menu = screen.getByTestId('shell-mobile-menu');
		const links = within(menu).getAllByRole('link');
		const labels = links.map((link) => (link.textContent ?? '').trim());
		expect(labels.slice(0, 5)).toEqual(['Calendar', 'Dashboard', 'Tasks', 'Groceries', 'Family']);
		expect(labels).not.toContain('Alerts');
		expect(screen.getByRole('link', { name: 'Tasks' }).className).toContain('bg-primary-100');
		expect(screen.getByRole('link', { name: 'Dashboard' }).className).not.toContain(
			'bg-primary-100'
		);
	});

	it('traps focus in the open menu', () => {
		renderMenu({ user: summary() });
		const menu = screen.getByTestId('shell-mobile-menu');
		expect(menu.contains(document.activeElement)).toBe(true);
	});
});
