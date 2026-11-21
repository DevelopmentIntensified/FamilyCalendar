/**
 * The page body: the header's day URLs, the streamed shell (skeleton then cards
 * or the retry card), the warning banner's labels, and the hidden-module gates.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import DayDashboardPage from './DayDashboardPage.svelte';
import type { DashboardData, DayDashboardPageData } from '../dayDashboard.contract';

afterEach(cleanup);

const ALL_VISIBLE = {
	verse: true,
	glance: true,
	top3: true,
	completed: true,
	board: true,
	kids: true,
	groceries: true,
	meals: true
};

function legs(overrides: Partial<DashboardData> = {}): DashboardData {
	return {
		userTasks: [],
		familyTasks: [],
		familyMembers: [],
		dayEvents: [],
		top3: [],
		glance: { doneToday: 0, openToday: 0, weekStreak: 0 },
		completedToday: [],
		kidsSchedule: [],
		familyGroceries: [],
		mineGroceries: [],
		...overrides
	};
}

function pageData(overrides: Partial<DayDashboardPageData> = {}): DayDashboardPageData {
	return {
		zone: 'UTC',
		dayISO: '2026-11-02T00:00:00.000Z',
		isToday: false,
		meId: 'user-me',
		familyId: null,
		modules: ALL_VISIBLE,
		taskCategories: [],
		loadWarnings: [],
		defaultView: null,
		data: Promise.resolve({ ...legs(), warnings: [] }),
		...overrides
	};
}

describe('DayDashboardPage', () => {
	it('names the three days it can reach, by URL', async () => {
		render(DayDashboardPage, { props: { data: pageData(), refresh: async () => {} } });
		expect(screen.getByText('Monday, November 2')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Previous day' })).toHaveAttribute(
			'href',
			'/calendar/dashboard?date=2026-11-01'
		);
		expect(screen.getByRole('link', { name: 'Next day' })).toHaveAttribute(
			'href',
			'/calendar/dashboard?date=2026-11-03'
		);
		expect(screen.getByRole('link', { name: 'Go to today' })).toHaveAttribute(
			'href',
			'/calendar/dashboard'
		);
		expect(screen.getByRole('link', { name: 'Open day view for Monday, November 2' })).toHaveAttribute(
			'href',
			'/calendar?date=2026-11-02&view=day'
		);
		expect(screen.getByRole('link', { name: 'Back to Calendar' })).toHaveAttribute(
			'href',
			'/calendar'
		);
		await waitFor(() => expect(screen.getByText('Day at a Glance')).toBeTruthy());
	});

	it('sends "Back to Calendar" to the board when the Default View is dashboard', async () => {
		render(DayDashboardPage, {
			props: { data: pageData({ defaultView: 'dashboard' }), refresh: async () => {} }
		});
		expect(screen.getByRole('link', { name: 'Back to Calendar' })).toHaveAttribute(
			'href',
			'/calendar?dashboardView=1'
		);
		await waitFor(() => expect(screen.getByText('Day at a Glance')).toBeTruthy());
	});

	it('renders the streamed (pending) shell as the band’s own skeleton', () => {
		const { container } = render(DayDashboardPage, {
			props: {
				data: pageData({ data: new Promise(() => {}) }),
				refresh: async () => {}
			}
		});
		expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6);
		expect(screen.queryByText('Day at a Glance')).toBeNull();
	});

	it('draws the retry card when the stream rejects, and refreshes on Retry', async () => {
		const refresh = vi.fn(async () => {});
		render(DayDashboardPage, {
			props: { data: pageData({ data: Promise.reject(new Error('nope')) }), refresh }
		});
		await waitFor(() => expect(screen.getByText(/Couldn't load the dashboard\./)).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it('banners the failed labels in order — the page’s first, then the legs’', async () => {
		render(DayDashboardPage, {
			props: {
				data: pageData({
					loadWarnings: ['settings'],
					data: Promise.resolve({ ...legs(), warnings: ['tasks', 'events'] })
				}),
				refresh: async () => {}
			}
		});
		await waitFor(() =>
			expect(
				screen.getByText(
					"Couldn't load settings, tasks, events just now — everything else is up to date."
				)
			).toBeTruthy()
		);
	});

	it('leaves out a card whose module is hidden', async () => {
		render(DayDashboardPage, {
			props: {
				data: pageData({ modules: { ...ALL_VISIBLE, glance: false } }),
				refresh: async () => {}
			}
		});
		await waitFor(() => expect(screen.getByText('Top-3 Priorities')).toBeTruthy());
		expect(screen.queryByText('Day at a Glance')).toBeNull();
	});
});
