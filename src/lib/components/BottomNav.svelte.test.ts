import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/svelte';
import BottomNav from './BottomNav.svelte';

vi.mock('$app/stores', () => ({
	page: {
		subscribe: vi.fn((cb: (value: unknown) => void) => {
			cb({ url: new URL('http://test.com/calendar') });
			return () => {};
		})
	}
}));

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('BottomNav', () => {
	it('renders all five tabs including Alerts', () => {
		render(BottomNav);
		expect(screen.getByText('Calendar')).toBeInTheDocument();
		expect(screen.getByText('Dashboard')).toBeInTheDocument();
		expect(screen.getByText('Tasks')).toBeInTheDocument();
		expect(screen.getByText('Alerts')).toBeInTheDocument();
		expect(screen.getByText('Family')).toBeInTheDocument();
	});

	it('does not fetch the badge for guests', () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		render(BottomNav, { props: { isLoggedIn: false } });

		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.queryByText('3')).not.toBeInTheDocument();
	});

	it('shows the unread badge when logged in', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ notifications: [], unreadCount: 3 })
		});
		vi.stubGlobal('fetch', fetchMock);
		render(BottomNav, { props: { isLoggedIn: true } });

		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/notifications'));
		await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
	});

	it('hides the badge when the summary fetch fails', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
		vi.stubGlobal('fetch', fetchMock);
		render(BottomNav, { props: { isLoggedIn: true } });

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(screen.queryByText('5')).not.toBeInTheDocument();
	});
});