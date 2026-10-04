import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import StatsPage from './+page.svelte';
import type { PageData } from './$types';

/**
 * 093 rerun, against the approved prototype line by line.
 *
 * The previous round of this file asserted the OPPOSITE of two of these on the
 * argument that the prototype's argument card "was cut at review" and "never
 * existed in the app". That reasoning is overruled: the prototype is the spec,
 * so the card is built and those assertions are gone.
 */

function makeData() {
	return {
		stats: {
			completedOnce: 12,
			recurringTasks: 3,
			recurringCompletions: 41,
			topAssigners: [{ name: 'Sarah Hopper', total: 9 }],
			topAssignees: [
				{ name: 'Jon', total: 14 },
				{ name: 'Sarah', total: 9 },
				{ name: 'Mia', total: 4 },
				{ name: 'Eli', total: 3 }
			],
			recentlyCompleted: [
				{ title: 'Take the bins out', completedAt: '2026-09-29T18:04:00.000Z', recurring: false },
				{ title: 'Book the dentist', completedAt: '2026-09-28T18:04:00.000Z', recurring: true }
			]
		},
		streak: { current: 6, best: 11, freezeUsedInCurrentGap: false, lastCompletedWeek: '2026-W40' },
		completionIso: [
			'2026-09-30T18:04:00.000Z',
			'2026-09-28T18:04:00.000Z',
			'2026-09-21T18:04:00.000Z'
		],
		todayIso: '2026-09-30T08:00:00.000Z',
		month: { completed: 23, recurring: 7 },
		doneBy: [
			{ name: 'Jon', count: 12 },
			{ name: 'Sarah', count: 9 }
		],
		roster: [
			{ firstName: 'Jon', memberType: 'parent' },
			{ firstName: 'Sarah', memberType: 'parent' },
			{ firstName: 'Mia', memberType: 'child' },
			{ firstName: 'Eli', memberType: 'child' }
		]
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

describe('Task stats page — the streak hero', () => {
	afterEach(cleanup);

	// The prototype: "Current streak" eyebrow, a 3rem number, the word "weeks"
	// beside it, and "Best: 11 weeks".
	it('states the streak as an eyebrow, a number and its unit', () => {
		render(StatsPage, props());
		expect(screen.getByText('Current streak')).toBeTruthy();
		expect(screen.getByTestId('streak-weeks').textContent).toContain('6');
		expect(screen.getByText('weeks')).toBeTruthy();
		expect(screen.getByText(/Best: 11 weeks/)).toBeTruthy();
	});

	// The prototype: seven squares, the filled ones mint, the current week
	// outlined, labelled W1..W7.
	it('draws the seven-square week grid the prototype shows', () => {
		render(StatsPage, props());
		const cells = [...document.querySelectorAll('[data-testid="streak-week"]')];
		expect(cells).toHaveLength(7);
		expect(cells.map((c) => c.textContent?.trim())).toEqual([
			'W1',
			'W2',
			'W3',
			'W4',
			'W5',
			'W6',
			'W7'
		]);
		// Three completions, two of them in different weeks -> three lit squares:
		// 2026-W40 (twice), 2026-W39.
		const lit = cells.filter((c) => c.querySelector('i')!.className.includes('bg-mint-200'));
		expect(lit).toHaveLength(2);
	});

	it('outlines the week that is still running', () => {
		render(StatsPage, props());
		const current = [...document.querySelectorAll('[data-testid="streak-week"]')].at(-1)!;
		expect(current.querySelector('i')!.className).toContain('ring-2');
	});

	it('keeps the hero caption the prototype writes under it', () => {
		render(StatsPage, props());
		expect(screen.getByText(/at least one task completed/i)).toBeTruthy();
	});
});

describe('Task stats page — the monthly totals', () => {
	afterEach(cleanup);

	// The prototype card is titled "This month" and carries exactly two
	// numbers: completed, and how many of them were recurring.
	it('reads its two numbers from the month that is running', () => {
		render(StatsPage, props());
		expect(screen.getByText('This month')).toBeTruthy();
		expect(screen.getByText('September 2026')).toBeTruthy();
		expect(screen.getByTestId('month-completed').textContent).toContain('23');
		expect(screen.getByTestId('month-recurring').textContent).toContain('7');
	});

	it('no longer labels the all-time task totals as this month', () => {
		render(StatsPage, props());
		// `stats.completedOnce` counts `tasks.completedAt`, which the recurring
		// cursor overwrites; showing it under "This month" was the wrong number.
		expect(screen.queryByText('Completed tasks')).toBeNull();
		expect(screen.queryByText('Recurring check-offs')).toBeNull();
	});
});

describe('Task stats page — the assignment bars', () => {
	afterEach(cleanup);

	// The prototype titles them "Tasks land on" and "Tasks come from" and
	// draws each row as a scaled bar, not a badge beside a name.
	it('names the two assignment charts the way the prototype names them', () => {
		render(StatsPage, props());
		expect(screen.getByText('Tasks land on')).toBeTruthy();
		expect(screen.getByText('Tasks come from')).toBeTruthy();
	});

	it('scales each bar against the largest count', () => {
		render(StatsPage, props());
		const bars = [...document.querySelectorAll('[data-testid="bar-fill"]')];
		// SAFETY: every bar-fill is the inline-styled <i> the page renders for
		// one row, so the query finds only elements carrying a width style.
		const widths = bars.map((b) => (b as HTMLElement).style.width);
		expect(widths).toContain('100%');
		expect(widths).toContain('64%'); // 9 of 14
	});
});

describe('Task stats page — the children are in the numbers', () => {
	afterEach(cleanup);

	// The card the previous round deleted on the grounds it "never existed in
	// the app". The prototype shows it full-width, so the page shows it too.
	it('carries the card arguing that assigned-to is not done-by', () => {
		render(StatsPage, props());
		const card = screen.getByText('The children are in the numbers').closest('section')!;
		const text = card.textContent?.replace(/\s+/g, ' ') ?? '';
		expect(text).toContain('assigned to');
		expect(text).toContain('done by');
	});

	it('reads the paired numbers off the real data, not a hardcoded example', () => {
		render(StatsPage, props());
		const chip = screen.getByTestId('assigned-vs-done').textContent!.replace(/\s+/g, ' ');
		// Mia: 4 assigned, 0 done. Eli: 3 assigned, 0 done.
		expect(chip).toContain('Mia 4 / 0');
		expect(chip).toContain('Eli 3 / 0');
		expect(chip).toContain('Jon 14 / 12');
	});

	it('does not call a member a child when the roster does not say so', () => {
		// No child Member Types means no children; the card still runs, but the
		// claim it makes is the weaker one it can actually support.
		render(
			StatsPage,
			props({
				...makeData(),
				roster: [
					{ firstName: 'Jon', memberType: 'parent' },
					{ firstName: 'Sarah', memberType: 'parent' }
				]
			})
		);
		expect(screen.getByTestId('children-claim').textContent).toContain('a member');
	});
});

describe('Task stats page — structure the prototype fixes', () => {
	afterEach(cleanup);

	it('puts Recently completed above the totals it summarises', () => {
		render(StatsPage, props());
		const order = [...document.querySelectorAll('h1, h2, h3, p')].map(
			(node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? ''
		);
		expect(order.indexOf('Recently completed')).toBeLessThan(order.indexOf('This month'));
	});

	it('puts the totals box in the same row as the two bar charts', () => {
		render(StatsPage, props());
		const row = document.querySelector('[data-testid="stats-equal-row"]');
		expect(row).toBeTruthy();
		const headings = [...row!.querySelectorAll('h2')].map((h) => h.textContent?.trim());
		expect(headings).toEqual(['This month', 'Tasks land on', 'Tasks come from']);
	});

	it('states the one-row-one-height contract on the row itself', () => {
		render(StatsPage, props());
		expect(document.querySelector('[data-testid="stats-equal-row"]')!.className).toContain(
			'items-stretch'
		);
	});

	// The prototype tags a repeating row with a "↻ repeating" token pill.
	it('marks a repeating completion with the repeating pill', () => {
		render(StatsPage, props());
		expect(screen.getByTestId('recently-completed').textContent).toContain('↻ repeating');
	});

	it('renders an empty history with the copy the prototype implies', () => {
		render(
			StatsPage,
			props({
				...makeData(),
				completionIso: [],
				month: { completed: 0, recurring: 0 },
				doneBy: [],
				stats: { ...makeData().stats, topAssignees: [], topAssigners: [], recentlyCompleted: [] }
			})
		);
		expect(screen.getByText(/first win awaits/i)).toBeTruthy();
		expect(screen.getByText('The children are in the numbers')).toBeTruthy();
	});
});