/**
 * The root chrome: app routes get the navbar and the tab bar, every other route
 * renders its children untouched and pays for no badge read, and no chrome
 * renders without a session model.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import type { ShellPorts, ShellUserSummary } from '../shell.contract';
import ShellRoot from './ShellRoot.svelte';

afterEach(cleanup);

const children = createRawSnippet(() => ({ render: () => '<p>Page body</p>' }));

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

function ports(badge: ShellPorts['badge'] = { unreadCount: async () => 4 }): ShellPorts {
	return {
		badge,
		verify: { submitCode: async () => ({ ok: true }), resendCode: async () => ({ ok: true }) },
		timezone: { save: async () => {} },
		offline: { isOnline: () => true, pendingCount: async () => 0, subscribe: () => () => {} }
	};
}

describe('ShellRoot', () => {
	it('renders the app chrome on a calendar route and reads the badge once', async () => {
		const unreadCount = vi.fn(async () => 4);
		render(ShellRoot, {
			props: {
				routeId: '/(calendar)/calendar',
				pathname: '/calendar',
				search: '',
				user: summary(),
				ports: ports({ unreadCount }),
				navigate: () => {},
				children
			}
		});
		await tick();
		expect(screen.getByTestId('shell-navbar')).toBeInTheDocument();
		expect(screen.getByTestId('shell-tab-bar')).toBeInTheDocument();
		expect(screen.getByText('Page body')).toBeInTheDocument();
		expect(unreadCount).toHaveBeenCalledTimes(1);
	});

	it('renders no chrome and reads nothing on a route outside the app', async () => {
		const unreadCount = vi.fn(async () => 4);
		render(ShellRoot, {
			props: {
				routeId: '/(marketing)',
				pathname: '/pricing',
				search: '',
				user: null,
				ports: ports({ unreadCount }),
				navigate: () => {},
				children
			}
		});
		await tick();
		expect(screen.queryByTestId('shell-navbar')).toBeNull();
		expect(screen.queryByTestId('shell-tab-bar')).toBeNull();
		expect(screen.getByText('Page body')).toBeInTheDocument();
		expect(unreadCount).not.toHaveBeenCalled();
	});

	it('renders no chrome on a 404 route id', () => {
		render(ShellRoot, {
			props: {
				routeId: null,
				pathname: '/nope',
				search: '',
				user: null,
				ports: ports(),
				navigate: () => {},
				children
			}
		});
		expect(screen.queryByTestId('shell-navbar')).toBeNull();
		expect(screen.getByText('Page body')).toBeInTheDocument();
	});
});
