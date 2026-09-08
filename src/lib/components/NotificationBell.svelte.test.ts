import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NotificationBell from './NotificationBell.svelte';

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
			json: () => Promise.resolve({ notifications: [], unreadCount: 0 })
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
