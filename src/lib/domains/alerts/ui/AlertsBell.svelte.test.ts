/**
 * The nav bell as the reader sees it: the 44px trigger, the capped badge, the
 * dropdown's empty/error states, the shared label tables, the read-mark
 * failure copy, and the push section's four approved lines.
 *
 * The component takes its api, env and toasts as props, so nothing here mocks
 * a module or reaches the network.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte.js';
import type { AlertRow } from '../alerts.contract';
import type { AlertsBellApi } from '../alerts.bell.state.svelte.js';
import type { PushEnvironment } from '../alerts.push.api';
import AlertsBell from './AlertsBell.svelte';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const ZONE = 'UTC';

afterEach(cleanup);

function row(over: Partial<AlertRow> = {}): AlertRow {
	return {
		id: 'n1',
		type: 'assignment_pending',
		rawType: 'assignment_pending',
		group: 'needs_you',
		actorName: 'Sarah',
		message: 'asked you to book the wall',
		link: '/calendar/tasks',
		readAt: null,
		createdAt: '2026-11-19 09:00:00+00',
		...over
	};
}

function fakeApi(rows: AlertRow[], over: Partial<AlertsBellApi> = {}): AlertsBellApi {
	return {
		list: vi.fn(async () => ({
			ok: true as const,
			data: { notifications: rows, unreadCount: rows.filter((r) => !r.readAt).length }
		})),
		mark: vi.fn(async () => ({ ok: true as const, data: { success: true as const } })),
		markAll: vi.fn(async () => ({ ok: true as const, data: { success: true as const } })),
		publicKey: vi.fn(async () => ({ ok: true as const, data: { publicKey: 'dGVzdA==' } })),
		subscribePush: vi.fn(async () => ({ ok: true as const, data: { success: true as const } })),
		unsubscribePush: vi.fn(async () => ({ ok: true as const, data: { success: true as const } })),
		...over
	};
}

function fakeEnv(over: Partial<PushEnvironment> = {}): PushEnvironment {
	return {
		supported: () => true,
		secure: () => true,
		permission: () => 'granted',
		requestPermission: async () => 'granted',
		registration: async () => null,
		...over
	};
}

function renderBell(options: {
	rows?: AlertRow[];
	api?: AlertsBellApi;
	env?: PushEnvironment;
} = {}) {
	const api = options.api ?? fakeApi(options.rows ?? []);
	const navigate = vi.fn();
	const toasts = memoryToasts();
	render(AlertsBell, {
		props: {
			api,
			toasts,
			env: options.env ?? fakeEnv(),
			navigate,
			now: NOW,
			zone: ZONE,
			pollMs: 1_000_000
		}
	});
	return { api, navigate, toasts };
}

describe('AlertsBell — the trigger', () => {
	it('is 44px square', () => {
		renderBell();
		const bell = screen.getByRole('button', { name: /notifications/i });
		expect(bell.className).toContain('h-11');
		expect(bell.className).toContain('w-11');
	});

	it('caps the badge at 99+ and names the count in its label', async () => {
		renderBell({
			rows: [],
			api: fakeApi([], {
				list: async () => ({
					ok: true as const,
					data: { notifications: [], unreadCount: 120 }
				})
			})
		});
		const bell = screen.getByRole('button', { name: /notifications/i });
		await vi.waitFor(() => expect(bell).toHaveTextContent('99+'));
		expect(bell).toHaveAttribute('aria-label', 'Notifications (120 unread)');
	});
});

describe('AlertsBell — the dropdown', () => {
	it('names the quiet home front when there is nothing', async () => {
		renderBell();
		await fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
		expect(
			await screen.findByText('No notifications yet — all quiet on the home front.')
		).toBeInTheDocument();
	});

	it('offers a retry when the read fails', async () => {
		renderBell({
			api: fakeApi([], {
				list: async () => ({ ok: false as const, status: 500, error: 'boom' })
			})
		});
		await fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
		expect(await screen.findByText("Couldn't load notifications.")).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
	});

	it('labels each type with the shared human label and never echoes the column', async () => {
		renderBell({
			rows: [row()],
			api: fakeApi([
				row(),
				row({ id: 'n2', type: null, rawType: 'mystery_type', message: 'did something new' })
			])
		});
		await fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
		expect(await screen.findByText('Asked you')).toBeInTheDocument();
		expect(screen.getByText('Update')).toBeInTheDocument();
		expect(screen.queryByText('mystery_type')).not.toBeInTheDocument();
	});

	it('says so when marking read fails instead of swallowing it', async () => {
		const { navigate, toasts } = renderBell({
			rows: [row()],
			api: fakeApi([row()], {
				mark: async () => ({ ok: false as const, status: 500, error: 'boom' })
			})
		});
		await fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
		const item = await screen.findByRole('button', { name: /asked you to book the wall/ });
		await fireEvent.click(item);
		await vi.waitFor(() =>
			expect(toasts.items).toEqual([
				{ kind: 'error', text: "Couldn't mark that alert read — it stays in your list." }
			])
		);
		expect(navigate).toHaveBeenCalledWith('/calendar/tasks');
	});
});

describe('AlertsBell — the push section', () => {
	it('says notifications are blocked when permission is denied', async () => {
		renderBell({ env: fakeEnv({ permission: () => 'denied' }) });
		await fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
		expect(
			await screen.findByText('Notifications blocked in browser settings.')
		).toBeInTheDocument();
	});

	it('shows the enabled row and a way to turn it off when subscribed', async () => {
		const env = fakeEnv({
			registration: async () => ({
				existing: async () => ({
					endpoint: 'https://push.example/1',
					keys: { p256dh: 'key', auth: 'auth' },
					unsubscribe: async () => true
				}),
				subscribe: async () => {
					throw new Error('should not subscribe again');
				}
			})
		});
		renderBell({ env });
		await fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
		expect(await screen.findByText(/Push notifications on/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument();
	});

	it('offers the enable button when the server has a key', async () => {
		renderBell();
		await fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
		expect(
			await screen.findByRole('button', { name: 'Enable push notifications' })
		).toBeInTheDocument();
	});
});
