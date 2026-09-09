import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import NavbarMobileMenu from './NavbarMobileMenu.svelte';
import { loggedInNavItems, marketingNavItems } from '$lib/utils/navItems';

const base = {
	user: null,
	activeHref: null as string | null,
	onNavigate: () => {},
	onLogoutSubmit: () => {}
};

afterEach(cleanup);

describe('NavbarMobileMenu', () => {
	it('highlights the active item for logged-in users', () => {
		render(NavbarMobileMenu, {
			props: {
				...base,
				isLoggedIn: true,
				navItems: loggedInNavItems,
				activeHref: '/calendar/tasks'
			}
		});
		expect(screen.getByRole('link', { name: 'Tasks' }).className).toContain(
			'bg-primary-100'
		);
		expect(screen.getByRole('link', { name: 'Calendar' }).className).not.toContain(
			'bg-primary-100'
		);
		expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
	});

	it('shows sign-in CTAs for guests', () => {
		render(NavbarMobileMenu, {
			props: { ...base, isLoggedIn: false, navItems: marketingNavItems }
		});
		expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Get Started' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
	});

	it('notifies the parent on navigation so the menu can close', async () => {
		const onNavigate = vi.fn();
		render(NavbarMobileMenu, {
			props: { ...base, isLoggedIn: false, navItems: marketingNavItems, onNavigate }
		});
		await fireEvent.click(screen.getByRole('link', { name: 'Pricing' }));
		expect(onNavigate).toHaveBeenCalledOnce();
	});
});
