/**
 * The profile dropdown: registered-only header (#242), admin-only rows, the
 * required `?from=` bug link, the menu order, and the logout form whose submit
 * purges the cached authed data before the POST navigates.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { ShellUserSummary } from '../shell.contract';
import ShellProfileMenu from './ShellProfileMenu.svelte';

afterEach(cleanup);

function summary(overrides: Partial<ShellUserSummary> = {}): ShellUserSummary {
	return {
		id: 'user-1',
		firstName: 'Mia',
		lastName: 'Rivera',
		email: 'mia@example.test',
		isAdmin: false,
		emailVerified: true,
		lastActiveAt: new Date('2026-06-01T12:00:00.000Z'),
		...overrides
	};
}

const GUEST_EMAIL = 'guest-abc@anonymous.placeholder.invalid';

describe('ShellProfileMenu', () => {
	it('never shows a guest the placeholder email and gates admin links', () => {
		render(ShellProfileMenu, {
			props: {
				user: summary({ email: GUEST_EMAIL }),
				reportBugHref: '/report-bug',
				onNavigate: () => {},
				onLogoutSubmit: () => {}
			}
		});
		expect(screen.queryByText(GUEST_EMAIL)).toBeNull();
		expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Bug Reports' })).toBeNull();
		cleanup();

		render(ShellProfileMenu, {
			props: {
				user: summary({ isAdmin: true }),
				reportBugHref: '/report-bug',
				onNavigate: () => {},
				onLogoutSubmit: () => {}
			}
		});
		expect(screen.getByTestId('shell-profile-menu')).toHaveTextContent('Mia Rivera');
		expect(screen.getByText('mia@example.test')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin/nlp');
		expect(screen.getByRole('link', { name: 'Bug Reports' })).toHaveAttribute(
			'href',
			'/admin/bugs'
		);
	});

	it('lays the account rows out in the legacy order', () => {
		render(ShellProfileMenu, {
			props: {
				user: summary(),
				reportBugHref: '/report-bug?from=%2Fcalendar',
				onNavigate: () => {},
				onLogoutSubmit: () => {}
			}
		});
		expect(screen.getAllByRole('link').map((link) => link.textContent?.trim())).toEqual([
			'Settings',
			'Family Management',
			'Task Stats',
			'Archive',
			'Report a Bug'
		]);
	});

	it('passes ?from= to the bug form and never for /report-bug', () => {
		render(ShellProfileMenu, {
			props: {
				user: summary(),
				reportBugHref: '/report-bug?from=%2Fcalendar%2Ftasks%3Fday%3D1',
				onNavigate: () => {},
				onLogoutSubmit: () => {}
			}
		});
		expect(screen.getByRole('link', { name: 'Report a Bug' })).toHaveAttribute(
			'href',
			'/report-bug?from=%2Fcalendar%2Ftasks%3Fday%3D1'
		);
		cleanup();

		render(ShellProfileMenu, {
			props: { user: summary(), reportBugHref: '/report-bug', onNavigate: () => {}, onLogoutSubmit: () => {} }
		});
		expect(screen.getByRole('link', { name: 'Report a Bug' })).toHaveAttribute(
			'href',
			'/report-bug'
		);
	});

	it('posts the logout form and purges the data cache', async () => {
		const onLogoutSubmit = vi.fn();
		const onNavigate = vi.fn();
		render(ShellProfileMenu, {
			props: {
				user: summary(),
				reportBugHref: '/report-bug',
				onNavigate,
				onLogoutSubmit
			}
		});

		const form = screen.getByRole('button', { name: 'Logout' }).closest('form');
		expect(form).toHaveAttribute('action', '/api/logout');
		expect(form).toHaveAttribute('method', 'POST');

		if (!form) throw new Error('expected the logout form');
		await fireEvent.submit(form);
		expect(onLogoutSubmit).toHaveBeenCalledTimes(1);

		await fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
		expect(onNavigate).toHaveBeenCalledTimes(1);
	});
});
