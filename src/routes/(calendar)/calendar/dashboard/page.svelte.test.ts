import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import DashboardPage from './+page.svelte';
import type { PageData } from './$types';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(() => Promise.resolve()) }));

// 118 mark 1.5: the dashboard and the calendar page were building "Today" twice,
// and #104 changed only the calendar's. The page must mount the SHARED
// component ($lib/components/DayNav.svelte) — a second hand-rolled navigator in
// this file is exactly what the mark is about.
function makeData(isToday: boolean) {
	const fixture = {
		zone: 'America/New_York',
		dayISO: '2026-09-29',
		isToday,
		meId: 'u-sarah',
		userSettings: { defaultView: 'calendar' },
		familyId: null,
		modules: {},
		dailyVerse: null,
		loadWarnings: [],
		dashboardData: Promise.resolve({
			glance: { doneToday: 0, openToday: 0, weekStreak: 0 },
			dayEvents: [],
			top3: [],
			familyTasks: [],
			familyMembers: [],
			kidsSchedule: [],
			completedToday: [],
			familyGroceries: [],
			mineGroceries: [],
			warnings: []
		})
	};
	// SAFETY: a page fixture, asserted once here rather than threaded through
	// three cases. Every field the header reads is the dashboard loader's own
	// (`+page.server.ts:395-406`); the layout fields SvelteKit puts on PageData
	// are not this page's concern.
	// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the layout fields make PageData incomparable to a hand-built fixture, so the two-step is the only way to name it.
	const data = fixture as unknown as PageData;
	return { data };
}

afterEach(cleanup);

describe('the Day Dashboard header', () => {
	it('mounts the shared day navigator, once', () => {
		const { container } = render(DashboardPage, makeData(false));
		expect(container.querySelectorAll('[data-testid="daynav"]')).toHaveLength(1);
	});

	it('names the three days it can reach, by URL', () => {
		render(DashboardPage, makeData(false));
		expect(screen.getByRole('navigation', { name: 'Day navigation' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Previous day' })).toHaveAttribute(
			'href',
			'/calendar/dashboard?date=2026-09-28'
		);
		expect(screen.getByRole('link', { name: 'Next day' })).toHaveAttribute(
			'href',
			'/calendar/dashboard?date=2026-09-30'
		);
		expect(screen.getByRole('link', { name: 'Go to today' })).toHaveAttribute(
			'href',
			'/calendar/dashboard'
		);
	});

	it('still offers the two ways out of the dashboard', () => {
		render(DashboardPage, makeData(false));
		expect(screen.getByRole('link', { name: /open day view/i })).toHaveAttribute(
			'href',
			'/calendar?date=2026-09-29&view=day'
		);
		expect(screen.getByRole('link', { name: /back to calendar/i })).toBeTruthy();
	});
});
