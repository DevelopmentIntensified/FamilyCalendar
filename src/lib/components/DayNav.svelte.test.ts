import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import DayNav from './DayNav.svelte';

// 118 mark 1.5: "make this section like the change requested for the calendar
// page. make them look the same". Two hand-built date navigators is how "Today"
// drifts between them, so there is one component and the dashboard and the
// calendar both mount it.
//
// The calendar navigates in place (it owns a date store and calls goto), the
// dashboard navigates by URL (`?date=`). So each control is a link when it is
// given an href and a button when it is given a callback — the arrangement, the
// labels and the construction are shared either way.
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('DayNav — one date navigator, two callers', () => {
	it('is the calendar page’s joined control, not the dashboard’s three loose boxes', () => {
		// The calendar builds Today / prev / next as ONE pill
		// (CalendarToolbar.svelte:117-145). One pill, members with no ring of
		// their own, 40px members — the calendar is the reference, so the
		// dashboard is the one that changes shape.
		const { container } = render(DayNav, {
			props: { todayHref: '/t', previousHref: '/p', nextHref: '/n' }
		});
		const nav = container.querySelector('[data-testid="daynav"]')!;
		expect(nav.className).toContain('overflow-hidden');
		expect(nav.className).toContain('rounded-xl');
		// Three members, and no member carries a ring of its own — the pill's
		// ring is the only one.
		expect(nav.children).toHaveLength(3);
		for (const member of nav.children) {
			expect(member.className).not.toContain('border');
		}
	});

	it('names the landmark and the arrows from the period it moves by', () => {
		render(DayNav, {
			props: { period: 'day', todayHref: '/t', previousHref: '/p', nextHref: '/n' }
		});
		expect(screen.getByRole('navigation', { name: 'Day navigation' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Previous day' })).toHaveAttribute('href', '/p');
		expect(screen.getByRole('link', { name: 'Next day' })).toHaveAttribute('href', '/n');
		expect(screen.getByRole('link', { name: 'Go to today' })).toBeTruthy();
	});

	it('renders links when it is given hrefs, so the destination can be opened in a new tab', () => {
		render(DayNav, {
			props: {
				previousHref: '/calendar/dashboard?date=2026-09-28',
				nextHref: '/calendar/dashboard?date=2026-09-30',
				todayHref: '/calendar/dashboard'
			}
		});
		expect(screen.getByRole('link', { name: 'Previous day' })).toHaveAttribute(
			'href',
			'/calendar/dashboard?date=2026-09-28'
		);
		expect(screen.getByRole('link', { name: 'Next day' })).toHaveAttribute(
			'href',
			'/calendar/dashboard?date=2026-09-30'
		);
	});

	it('renders buttons and calls back when the caller navigates in place', async () => {
		const onPrevious = vi.fn();
		const onNext = vi.fn();
		const onToday = vi.fn();
		render(DayNav, { props: { period: 'period', onPrevious, onNext, onToday } });
		// The calendar's own labels, with the period named — "Previous" alone
		// could be a week or a month.
		expect(screen.getByRole('button', { name: 'Previous period' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Go to today' }));
		expect(onPrevious).toHaveBeenCalledTimes(1);
		expect(onNext).toHaveBeenCalledTimes(1);
		expect(onToday).toHaveBeenCalledTimes(1);
	});

	it('says where it already is, instead of making Today a dead control', async () => {
		const { rerender } = render(DayNav, { props: { todayHref: '/calendar/dashboard', isToday: false } });
		const today = screen.getByRole('link', { name: 'Go to today' });
		expect(today).not.toHaveAttribute('aria-current');
		await rerender({ todayHref: '/calendar/dashboard', isToday: true });
		expect(screen.getByRole('link', { name: 'Go to today' })).toHaveAttribute('aria-current', 'date');
	});
});

/**
 * #119 item 6 — the calendar's date control is "September 2026" and a pager, and
 * #120 marks 1.16/1.17 said those were three loose pieces that should be one
 * thing. So the toolbar adopted DayNav rather than hand-building a third copy —
 * and then needed to name the period INSIDE the same pill, because two pills
 * side by side is exactly the "three loose pieces" the review marked bad.
 *
 * Hence the one seam: a caller may name the period in the pill's own leading
 * segment. No ring of its own (the pill's is the only one) and no second
 * navigation landmark.
 */
describe('DayNav — a period label in the same pill (#119)', () => {
	afterEach(cleanup);

	const props = {
		period: 'period' as const,
		onPrevious: vi.fn(),
		onNext: vi.fn(),
		onToday: vi.fn()
	};
	// SAFETY: `data-testid="daynav"` is the nav this component always renders —
	// the only nav in the tree, asserted below.
	const nav = () => document.querySelector('[data-testid="daynav"]') as HTMLElement;

	it('takes no leading segment by default, so the dashboard is untouched', () => {
		render(DayNav, { props });
		expect(nav().children).toHaveLength(3);
		expect(nav().firstElementChild?.textContent?.trim()).toBe('Today');
	});

	it('renders a leading segment inside the pill, before Today', () => {
		const leading = createRawSnippet(() => ({
			render: () => `<button type="button">September 2026</button>`
		}));
		render(DayNav, { props: { ...props, leading } });
		const pill = nav();
		// Inside the pill, so the label and the pager are ONE control — the
		// "three loose pieces" #120 marked bad cannot come back.
		expect(within(pill).getByRole('button', { name: 'September 2026' })).toBeTruthy();
		expect([...pill.children].map((n) => n.getAttribute('aria-label') ?? n.textContent?.trim())).toEqual([
			'September 2026',
			'Go to today',
			'Previous period',
			'Next period'
		]);
		// …and still one navigation landmark, not two.
		expect(document.querySelectorAll('nav')).toHaveLength(1);
	});
});
