/**
 * The marketing header: the public four for a guest, the app destinations for
 * a signed-in visitor (the legacy navbar), the guest CTAs, the 44 × 44
 * hamburger with its menu, Escape and an outside click closing the dropdown,
 * both menus closing on a navigation, the `?from=` bug link, and the logout
 * form purging the cached authed data (#029 M2).
 *
 * Expected values come from the legacy component
 * (`src/lib/components/Navbar.svelte` at 66a11131) and the issue notes it
 * cites.
 *
 * Doc: ../../README.md#invariants
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import type { MarketingNavLink } from '../marketing.content.rules';
import type { MarketingViewer } from '../marketing.contract';
import MarketingHeader from './MarketingHeader.svelte';

afterEach(() => {
	cleanup();
	Reflect.deleteProperty(navigator, 'serviceWorker');
	vi.restoreAllMocks();
});

/** The lazy menus and bell resolve a dynamic chunk: under load a microtask can take a moment. */
const LAZY = { timeout: 5000 };

const bellSnippet = createRawSnippet(() => ({
	render: () => '<span data-testid="marketing-bell"></span>'
}));

const APP_NAV: readonly MarketingNavLink[] = [
	{ href: '/calendar?dashboardView=1', label: 'Calendar' },
	{ href: '/calendar/dashboard', label: 'Dashboard' },
	{ href: '/calendar/tasks', label: 'Tasks' },
	{ href: '/calendar/groceries', label: 'Groceries' },
	{ href: '/family', label: 'Family' }
];

function viewer(overrides: Partial<MarketingViewer> = {}): MarketingViewer {
	return {
		firstName: 'Mia',
		lastName: 'Rivera',
		email: 'mia@example.test',
		roles: [],
		...overrides
	};
}

function renderHeader(
	overrides: {
		pathname?: string;
		search?: string;
		isLoggedIn?: boolean;
		user?: MarketingViewer | null;
	} = {}
) {
	const isLoggedIn = overrides.isLoggedIn ?? false;
	const user = overrides.user === undefined ? (isLoggedIn ? viewer() : null) : overrides.user;
	return render(MarketingHeader, {
		props: {
			pathname: overrides.pathname ?? '/pricing',
			search: overrides.search ?? '',
			isLoggedIn,
			user,
			appNavItems: APP_NAV
		}
	});
}

/** The header's desktop destination links, in DOM order. */
function desktopLinks(): HTMLAnchorElement[] {
	return Array.from(
		document.querySelectorAll<HTMLAnchorElement>('nav a[data-sveltekit-preload-data]')
	);
}

describe('MarketingHeader', () => {
	it('shows the public four to a guest, in order', () => {
		renderHeader();
		expect(desktopLinks().map((link) => link.textContent?.trim())).toEqual([
			'Features',
			'Pricing',
			'About',
			'Contact'
		]);
		expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login');
		expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute('href', '/signup');
		expect(document.querySelector('[data-testid="profile-dropdown-container"]')).toBeNull();
	});

	it('shows the signed-in destinations instead, and the viewer name', () => {
		renderHeader({ isLoggedIn: true });
		expect(desktopLinks().map((link) => link.textContent?.trim())).toEqual([
			'Calendar',
			'Dashboard',
			'Tasks',
			'Groceries',
			'Family'
		]);
		expect(screen.queryByRole('link', { name: 'Pricing' })).toBeNull();
		expect(screen.getByText('Mia')).toBeInTheDocument();
	});

	it('highlights the longest matching link', () => {
		renderHeader({ pathname: '/pricing/compare' });
		const pricing = desktopLinks().find((link) => link.textContent?.trim() === 'Pricing');
		const about = desktopLinks().find((link) => link.textContent?.trim() === 'About');
		expect(pricing?.className).toContain('text-primary-600');
		expect(about?.className).not.toContain('text-primary-600');
	});

	it('keeps the 44 px hamburger and opens the mobile menu', async () => {
		renderHeader({ pathname: '/contact' });
		const hamburger = screen.getByRole('button', { name: 'Open menu' });
		expect(hamburger.className).toContain('h-11');
		expect(hamburger.className).toContain('w-11');

		await fireEvent.click(hamburger);
		expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument();
		// Desktop links plus the same four in the menu (the menu is a lazy chunk:
		// waiting for its second copy is what the browser does too).
		await waitFor(
			() => expect(screen.getAllByRole('link', { name: 'Features' })).toHaveLength(2),
			LAZY
		);
		expect(screen.getAllByRole('link', { name: 'Contact' })).toHaveLength(2);
		expect(screen.getAllByRole('link', { name: 'Get Started' })).toHaveLength(2);
	});

	it('gives a signed-in visitor the account rows and Logout in the mobile menu', async () => {
		renderHeader({ isLoggedIn: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
		expect(await screen.findByRole('link', { name: 'Settings' }, LAZY)).toHaveAttribute(
			'href',
			'/account'
		);
		expect(await screen.findByRole('link', { name: 'Task Stats' }, LAZY)).toHaveAttribute(
			'href',
			'/calendar/stats'
		);
		expect(await screen.findByRole('link', { name: 'Archive' }, LAZY)).toHaveAttribute(
			'href',
			'/calendar/archive'
		);
		expect(await screen.findByRole('button', { name: 'Logout' }, LAZY)).toBeInTheDocument();
	});

	it('renders the bell snippet only for a signed-in visitor', () => {
		render(MarketingHeader, {
			props: {
				pathname: '/pricing',
				search: '',
				isLoggedIn: false,
				user: null,
				appNavItems: APP_NAV,
				bell: bellSnippet
			}
		});
		expect(screen.queryByTestId('marketing-bell')).toBeNull();
		cleanup();

		render(MarketingHeader, {
			props: {
				pathname: '/pricing',
				search: '',
				isLoggedIn: true,
				user: viewer(),
				appNavItems: APP_NAV,
				bell: bellSnippet
			}
		});
		expect(screen.getByTestId('marketing-bell')).toBeInTheDocument();
	});

	it('opens the profile dropdown and closes it on Escape and an outside click', async () => {
		renderHeader({ isLoggedIn: true });
		const container = document.querySelector('[data-testid="profile-dropdown-container"]');
		if (!container) throw new Error('expected the profile container');
		const trigger = within(container as HTMLElement).getByRole('button');

		await fireEvent.click(trigger);
		expect(trigger).toHaveAttribute('aria-expanded', 'true');
		expect(await screen.findByText('Mia Rivera', {}, LAZY)).toBeInTheDocument();
		expect(screen.getByText('mia@example.test')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/account');

		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(trigger).toHaveAttribute('aria-expanded', 'false');

		await fireEvent.click(trigger);
		expect(trigger).toHaveAttribute('aria-expanded', 'true');
		await fireEvent.click(document.body);
		expect(trigger).toHaveAttribute('aria-expanded', 'false');
	});

	it('closes both menus when the pathname prop changes', async () => {
		const { rerender } = renderHeader({ isLoggedIn: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
		// Signed in, so both navs list the app's destinations; the menu is a lazy
		// chunk, so wait for its second copy of one of them.
		await waitFor(
			() => expect(screen.getAllByRole('link', { name: 'Calendar' })).toHaveLength(2),
			LAZY
		);
		const container = document.querySelector('[data-testid="profile-dropdown-container"]');
		if (!container) throw new Error('expected the profile container');
		const trigger = within(container as HTMLElement).getByRole('button');
		await fireEvent.click(trigger);
		expect(trigger).toHaveAttribute('aria-expanded', 'true');
		expect(await screen.findByText('Mia Rivera', {}, LAZY)).toBeInTheDocument();

		await rerender({
			pathname: '/about',
			search: '',
			isLoggedIn: true,
			user: viewer(),
			appNavItems: APP_NAV
		});
		expect(trigger).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByText('Mia Rivera')).toBeNull();
		expect(screen.getAllByRole('link', { name: 'Calendar' })).toHaveLength(1);
		expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
	});

	it('carries the current path and search to the bug form, never /report-bug itself', async () => {
		renderHeader({ isLoggedIn: true, pathname: '/pricing', search: '?plan=annual' });
		const container = document.querySelector('[data-testid="profile-dropdown-container"]');
		if (!container) throw new Error('expected the profile container');
		await fireEvent.click(within(container as HTMLElement).getByRole('button'));

		expect(await screen.findByRole('link', { name: 'Report a Bug' }, LAZY)).toHaveAttribute(
			'href',
			`/report-bug?from=${encodeURIComponent('/pricing?plan=annual')}`
		);
		cleanup();

		renderHeader({ isLoggedIn: true, pathname: '/report-bug' });
		const second = document.querySelector('[data-testid="profile-dropdown-container"]');
		if (!second) throw new Error('expected the profile container');
		await fireEvent.click(within(second as HTMLElement).getByRole('button'));
		expect(await screen.findByRole('link', { name: 'Report a Bug' }, LAZY)).toHaveAttribute(
			'href',
			'/report-bug'
		);
	});

	it('posts the logout form and purges the cached authed data', async () => {
		const postMessage = vi.fn();
		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true,
			value: { controller: { postMessage } }
		});

		renderHeader({ isLoggedIn: true });
		const container = document.querySelector('[data-testid="profile-dropdown-container"]');
		if (!container) throw new Error('expected the profile container');
		await fireEvent.click(within(container as HTMLElement).getByRole('button'));

		const form = (await screen.findByRole('button', { name: 'Logout' }, LAZY)).closest('form');
		if (!form) throw new Error('expected the logout form');
		expect(form).toHaveAttribute('action', '/api/logout');
		expect(form).toHaveAttribute('method', 'POST');

		await fireEvent.submit(form);
		expect(postMessage).toHaveBeenCalledWith({ type: 'purge-data-cache' });
	});
});
