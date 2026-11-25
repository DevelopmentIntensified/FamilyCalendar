/**
 * The header: the desktop destination links (Alerts replaced by the bell), the
 * guest CTAs vs the profile button, the 44 × 44 hamburger, both menus closing on
 * a completed navigation, Escape and an outside click closing the dropdown, and
 * the bug link carrying the current path and search.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { ShellUserSummary } from '../shell.contract';
import ShellNavbar from './ShellNavbar.svelte';

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

function renderNavbar(overrides: { pathname?: string; search?: string; user?: ShellUserSummary | null } = {}) {
	return render(ShellNavbar, {
		props: {
			pathname: overrides.pathname ?? '/calendar',
			search: overrides.search ?? '',
			user: overrides.user === undefined ? summary() : overrides.user,
			onLogoutSubmit: vi.fn()
		}
	});
}

/** The avatar trigger, found by its container (the button labels itself with the name). */
function profileButton(): HTMLButtonElement {
	const button = document.querySelector<HTMLButtonElement>(
		'[data-testid="profile-dropdown-container"] button'
	);
	if (!button) throw new Error('expected the profile trigger');
	return button;
}

describe('ShellNavbar', () => {
	it('shows the sign-in CTAs to a guest', () => {
		renderNavbar({ user: null });
		expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login');
		expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute('href', '/signup');
		expect(screen.queryByTestId('profile-dropdown-container')).toBeNull();
	});

	it('drops Alerts from the desktop links and keeps the destination order', () => {
		renderNavbar();
		const nav = screen.getByTestId('shell-navbar');
		const links = Array.from(nav.querySelectorAll('a[data-sveltekit-preload-data]'));
		expect(links.map((link) => link.textContent?.trim())).toEqual([
			'Calendar',
			'Dashboard',
			'Tasks',
			'Groceries',
			'Family'
		]);
	});

	it('gives the mobile hamburger a 44 px square target', () => {
		renderNavbar();
		const hamburger = screen.getByRole('button', { name: 'Open menu' });
		expect(hamburger.className).toContain('h-11');
		expect(hamburger.className).toContain('w-11');
	});

	it('closes both menus when the pathname prop changes', async () => {
		const { rerender } = renderNavbar();
		await fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
		// Both menus are lazy chunks (ADR 0010), so they arrive a tick after the tap.
		expect(await screen.findByTestId('shell-mobile-menu')).toBeInTheDocument();
		await fireEvent.click(profileButton());
		expect(profileButton()).toHaveAttribute('aria-expanded', 'true');

		await rerender({
			pathname: '/calendar/tasks',
			search: '',
			user: summary(),
			onLogoutSubmit: vi.fn()
		});

		// The out-transitions keep the nodes for a frame, so the closed state is
		// read from the triggers: the hamburger's own label and the dropdown's flag.
		expect(profileButton()).toHaveAttribute('aria-expanded', 'false');
		expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
	});

	it('closes the profile menu on Escape and on an outside click', async () => {
		renderNavbar();
		await fireEvent.click(profileButton());
		expect(profileButton()).toHaveAttribute('aria-expanded', 'true');
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(profileButton()).toHaveAttribute('aria-expanded', 'false');

		await fireEvent.click(profileButton());
		expect(profileButton()).toHaveAttribute('aria-expanded', 'true');
		await fireEvent.click(document.body);
		expect(profileButton()).toHaveAttribute('aria-expanded', 'false');
	});

	it('passes the current path and search to the bug form', async () => {
		renderNavbar({ pathname: '/calendar/tasks', search: '?day=1' });
		await fireEvent.click(profileButton());
		expect(await screen.findByRole('link', { name: 'Report a Bug' })).toHaveAttribute(
			'href',
			'/report-bug?from=%2Fcalendar%2Ftasks%3Fday%3D1'
		);
	});
});
