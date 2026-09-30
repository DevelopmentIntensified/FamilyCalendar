import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NotificationBell from './NotificationBell.svelte';
import { measureBox, MIN_TOUCH } from '$lib/utils/touchTarget';

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
