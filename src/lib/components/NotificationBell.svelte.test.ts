import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NotificationBell from './NotificationBell.svelte';
import { measureBox, MIN_TOUCH } from '$lib/utils/touchTarget';
import { pushToast } from '$lib/client/toasts';
import { toNotificationRow, type NotificationRow } from '$lib/utils/notificationTypes';

// oxlint-disable-next-line anti-slop/no-module-mocking -- toasts are a global store; the real one is fine to watch.
vi.mock('$lib/client/toasts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	pushToast: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));

let rows: unknown[] = [];

beforeEach(() => {
	// SAFETY: jsdom-only polyfill — svelte's slide transition calls
	// Element.animate on open; jsdom does not implement it.
	Object.defineProperty(window.Element.prototype, 'animate', {
		value: vi.fn().mockReturnValue({ finished: Promise.resolve(), cancel: vi.fn() }),
		configurable: true
	});
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ notifications: rows, unreadCount: rows.length })
		})
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

describe('NotificationBell empty state', () => {
	it('names the quiet home front', async () => {
		render(NotificationBell);
		await fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
		expect(
			await screen.findByText('No notifications yet — all quiet on the home front.')
		).toBeInTheDocument();
	});
});

// Issue 015 measured the bell rather than eyeballing it: already 44×44.
describe('NotificationBell touch target', () => {
	it('is 44px square', () => {
		render(NotificationBell);
		// SAFETY: the bell trigger is a <button> in NotificationBell.
		const bell = screen.getByRole('button', { name: /notifications/i });
		expect(measureBox(bell.className)).toEqual({ width: 44, height: 44 });
		expect(MIN_TOUCH).toBe(44);
	});
});

// Issue 073: the bell dropdown and the Alerts page show the same five types.
// Each carried its own label table, so they had already drifted.
describe('NotificationBell labels agree with the Alerts page', () => {
	/** Rows as /api/notifications actually returns them: already guarded. */
	const row = (over: Record<string, unknown> = {}) =>
		toNotificationRow({
			id: 'n1',
			type: 'assignment_pending',
			actorName: 'Sarah',
			message: 'asked you to book the wall',
			link: '/calendar/tasks',
			readAt: null,
			createdAt: '2026-09-30T09:00:00.000Z',
			...over
		});

	async function openWith(...r: NotificationRow[]) {
		rows = r;
		render(NotificationBell);
		await fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
		return screen.findByRole('button', { name: /asked you to book the wall|did something new/ });
	}

	it('names each type with the shared human label', async () => {
		await openWith(row());
		expect(await screen.findByText('Asked you')).toBeInTheDocument();
	});

	it('names an unrecognised type explicitly instead of echoing the column value', async () => {
		await openWith(row({ type: 'mystery_type', message: 'did something new' }));
		expect(await screen.findByText('Update')).toBeInTheDocument();
		expect(screen.queryByText('mystery_type')).not.toBeInTheDocument();
	});

	it('says so when marking read fails instead of swallowing it', async () => {
		// The GET succeeds so the list renders; only the read-mark POST fails.
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) =>
				init?.method === 'POST'
					? { ok: false, json: () => Promise.resolve({}) }
					: {
							ok: true,
							json: () => Promise.resolve({ notifications: [row()], unreadCount: 1 })
						}
			)
		);
		const trigger = await openWith(row());
		await fireEvent.click(trigger);
		await vi.waitFor(() => expect(pushToast).toHaveBeenCalled());
		expect(vi.mocked(pushToast).mock.calls[0][0].message).toMatch(/couldn/i);
	});
});
