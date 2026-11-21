/**
 * The group frame: the banner stack with the countdown notice for a guest, the
 * `<main>` offset from the measured stack (and the 40 px one-line guess before
 * the first measurement), and the calendar-only footer with the server year.
 *
 * Doc: ../README.md#invariants
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import type { ShellPorts, ShellUserSummary } from '../shell.contract';
import ShellGroupFrame from './ShellGroupFrame.svelte';

afterEach(cleanup);

/**
 * jsdom has no ResizeObserver, and Svelte's `bind:clientHeight` creates one when
 * the stack mounts. The stub never reports a size: the binding's own initial
 * read (`element.clientHeight`) is what the offset assertions exercise.
 */
class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

beforeAll(() => {
	Object.defineProperty(globalThis, 'ResizeObserver', {
		configurable: true,
		value: ResizeObserverStub
	});
});

afterAll(() => {
	Reflect.deleteProperty(globalThis, 'ResizeObserver');
});

const children = createRawSnippet(() => ({ render: () => '<p>Page body</p>' }));

function ports(): ShellPorts {
	return {
		badge: { unreadCount: async () => 0 },
		verify: { submitCode: async () => ({ ok: true }), resendCode: async () => ({ ok: true }) },
		timezone: { save: async () => {} },
		offline: { isOnline: () => true, pendingCount: async () => 0, subscribe: () => () => {} }
	};
}

function guest(): ShellUserSummary {
	return {
		id: 'guest-1',
		firstName: 'Guest',
		lastName: '',
		email: 'guest-1@anonymous.placeholder.invalid',
		isAdmin: false,
		emailVerified: null,
		lastActiveAt: null
	};
}

function main(): HTMLElement {
	return screen.getByTestId('shell-main');
}

describe('ShellGroupFrame', () => {
	it('offsets main by the measured stack height', async () => {
		const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
		Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
			configurable: true,
			get: () => 64
		});
		try {
			render(ShellGroupFrame, {
				props: {
					variant: 'calendar',
					scope: { user: guest(), year: 2026, daysLeft: 30 },
					search: '',
					ports: ports(),
					children
				}
			});
			await tick();
			expect(main().style.marginTop).toBe('64px');
		} finally {
			if (descriptor) Object.defineProperty(HTMLElement.prototype, 'clientHeight', descriptor);
			else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
		}
	});

	it('falls back to the 40 px one-line guess and shows the guest countdown', () => {
		render(ShellGroupFrame, {
			props: {
				variant: 'calendar',
				scope: { user: guest(), year: 2026, daysLeft: 30 },
				search: '',
				ports: ports(),
				children
			}
		});
		expect(main().style.marginTop).toBe('40px');
		expect(screen.getByTestId('shell-notice-anonymous')).toHaveTextContent('90 days');
		expect(screen.getByText('Page body')).toBeInTheDocument();
	});

	it('renders the footer links and the server year on calendar only', () => {
		render(ShellGroupFrame, {
			props: {
				variant: 'calendar',
				scope: { user: guest(), year: 2026, daysLeft: 30 },
				search: '',
				ports: ports(),
				children
			}
		});
		const footer = screen.getByTestId('shell-footer');
		expect(footer).toHaveTextContent('© 2026 FamilyPlanz');
		expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
		expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
		expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact');
		cleanup();

		render(ShellGroupFrame, {
			props: {
				variant: 'family',
				scope: { user: guest(), year: 2026 },
				ports: ports(),
				children
			}
		});
		expect(screen.queryByTestId('shell-footer')).toBeNull();
		expect(screen.queryByTestId('shell-notice-anonymous')).toBeNull();
	});

	it('shows the unverified-email notice with its inline form', () => {
		render(ShellGroupFrame, {
			props: {
				variant: 'calendar',
				scope: {
					user: { ...guest(), email: 'mia@example.test', emailVerified: false },
					year: 2026,
					daysLeft: 90
				},
				search: '',
				ports: ports(),
				children
			}
		});
		expect(screen.getByTestId('shell-notice-verify')).toBeInTheDocument();
		expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
	});

	it('dismisses the merge notice, which a guest never sees', async () => {
		const member = { ...guest(), email: 'mia@example.test', emailVerified: true };
		render(ShellGroupFrame, {
			props: {
				variant: 'calendar',
				scope: { user: member, year: 2026, daysLeft: 90 },
				search: '?merged=2&tasks=1',
				ports: ports(),
				children
			}
		});
		expect(screen.getByTestId('shell-notice-merged')).toHaveTextContent(
			'Brought over 2 events and 1 task from your guest calendar.'
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
		expect(screen.queryByTestId('shell-notice-merged')).toBeNull();
		cleanup();

		// A guest has no email to merge into: the countdown wins instead.
		render(ShellGroupFrame, {
			props: {
				variant: 'calendar',
				scope: { user: guest(), year: 2026, daysLeft: 90 },
				search: '?merged=2&tasks=1',
				ports: ports(),
				children
			}
		});
		expect(screen.queryByTestId('shell-notice-merged')).toBeNull();
		expect(screen.getByTestId('shell-notice-anonymous')).toBeInTheDocument();
	});
});
