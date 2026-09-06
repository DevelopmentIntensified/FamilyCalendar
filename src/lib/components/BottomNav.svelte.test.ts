import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/svelte';
import BottomNav from './BottomNav.svelte';

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('BottomNav', () => {
	it('renders all five tabs including Alerts', () => {
		render(BottomNav, { props: { currentPath: '/calendar' } });
		expect(screen.getByText('Calendar')).toBeInTheDocument();
		expect(screen.getByText('Dashboard')).toBeInTheDocument();
		expect(screen.getByText('Tasks')).toBeInTheDocument();
		expect(screen.getByText('Alerts')).toBeInTheDocument();
		expect(screen.getByText('Family')).toBeInTheDocument();
	});

	it('highlights the tab matching the injected currentPath (seam)', () => {
		render(BottomNav, { props: { currentPath: '/calendar/dashboard' } });
		expect(screen.getByText('Dashboard').closest('a')).toHaveAttribute('aria-current', 'page');
		expect(screen.getByText('Calendar').closest('a')).not.toHaveAttribute('aria-current');
	});

	it('does not fetch the badge for guests', () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		render(BottomNav, { props: { isLoggedIn: false, currentPath: '/calendar' } });

		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.queryByText('3')).not.toBeInTheDocument();
	});

	it('shows the unread badge when logged in', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ notifications: [], unreadCount: 3 })
		});
		vi.stubGlobal('fetch', fetchMock);
		render(BottomNav, { props: { isLoggedIn: true, currentPath: '/calendar' } });

		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/notifications'));
		await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
	});

	it('hides the badge when the summary fetch fails', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
		vi.stubGlobal('fetch', fetchMock);
		render(BottomNav, { props: { isLoggedIn: true, currentPath: '/calendar' } });

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(screen.queryByText('5')).not.toBeInTheDocument();
	});
});
