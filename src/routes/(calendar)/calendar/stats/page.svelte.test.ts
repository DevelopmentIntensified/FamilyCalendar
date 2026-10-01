import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import StatsPage from './+page.svelte';
import type { PageData } from './$types';

// SAFETY: a page fixture, built once here rather than threaded through every
// case. Every field is the shape `+page.server.ts` returns.
function makeData() {
	return {
		stats: {
			completedOnce: 12,
			recurringTasks: 3,
			recurringCompletions: 41,
			topAssigners: [{ name: 'Sarah Hopper', total: 9 }],
			topAssignees: [{ name: 'Mia Hopper', total: 4 }],
			recentlyCompleted: [
				{ title: 'Take the bins out', completedAt: '2026-09-29T18:04:00.000Z', recurring: false },
				{ title: 'Book the dentist', completedAt: '2026-09-28T18:04:00.000Z', recurring: true }
			]
		},
		streak: { current: 6, best: 9, freezeUsedInCurrentGap: false, lastCompletedWeek: '2026-W39' }
	};
}

/** PageData carries the layout's own fields (user, familyMembers, …) that this
 *  page never reads, so a hand-built fixture cannot satisfy the type. */
function props(stats = makeData()) {
	// SAFETY: `stats` is this page's own loader output verbatim; only the
	// layout's fields are absent, and the page reads none of them.
	// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the layout fields make PageData incomparable to a hand-built fixture, so the two-step is the only way to name it.
	return { data: stats as unknown as PageData };
}

/** Rendered reading order of every heading and label on the page. */
function readingOrder() {
	return [...document.querySelectorAll('h1, h2, h3, p')].map(
		(node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? ''
	);
}

describe('Task stats page', () => {
	afterEach(cleanup);

	// 093 mark: the recent list and the summary it summarises read as one
	// block, so Recently completed sits DIRECTLY above the totals row.
	it('puts Recently completed above the totals it summarises', () => {
		render(StatsPage, props());
		const order = readingOrder();
		const recent = order.indexOf('Recently completed');
		const totals = order.indexOf('Completed tasks');
		expect(recent).toBeGreaterThanOrEqual(0);
		expect(totals).toBeGreaterThanOrEqual(0);
		expect(recent).toBeLessThan(totals);
	});

	// The totals box shares a row with the two assignment lists, which is what
	// makes the equal-height mark meaningful: they have different content, so
	// equal height is the LAYOUT's doing and not an accident of equal copy.
	it('puts the totals box in the same row as the assignment lists', () => {
		render(StatsPage, props());
		const row = document.querySelector('[data-testid="stats-equal-row"]');
		expect(row).toBeTruthy();
		const headings = [...row!.querySelectorAll('h2')].map((h) => h.textContent?.trim());
		expect(headings).toEqual(['Totals', 'Assigned you the most', 'You assign the most']);
	});

	it('states the one-row-one-height contract on the row itself', () => {
		render(StatsPage, props());
		// `items-stretch` is the grid default; it is pinned in the class so the
		// contract is visible where the boxes are, not only in the e2e test.
		const row = document.querySelector('[data-testid="stats-equal-row"]')!;
		expect(row.className).toContain('items-stretch');
	});

	it('shows the recent rows themselves, not just the heading', () => {
		render(StatsPage, props());
		expect(screen.getByText('Take the bins out')).toBeTruthy();
		expect(screen.getByText('Book the dentist')).toBeTruthy();
	});

	// 093 mark: the justification card was cut from the approved prototype
	// because the page has to earn itself on its data. The app never had one -
	// this pins that it still does not, so the next reviewer marking the
	// prototype a third time is answered by this file, not by a triage call.
	it('carries no card arguing for its own existence', () => {
		render(StatsPage, props());
		expect(screen.queryByText(/why this page can exist/i)).toBeNull();
		expect(screen.queryByText(/taskCompletions/i)).toBeNull();
	});

	it('renders an empty history without an argument for itself', () => {
		render(StatsPage, {
			props: props({
				stats: {
					completedOnce: 0,
					recurringTasks: 0,
					recurringCompletions: 0,
					topAssigners: [],
					topAssignees: [],
					recentlyCompleted: []
				},
				streak: { current: 0, best: 0, freezeUsedInCurrentGap: false, lastCompletedWeek: null }
			})
		});
		expect(screen.getByText(/first win awaits/i)).toBeTruthy();
		expect(screen.queryByText(/why this page can exist/i)).toBeNull();
	});
});
