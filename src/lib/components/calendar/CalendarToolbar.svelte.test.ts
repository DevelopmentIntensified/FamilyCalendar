import { render, screen, fireEvent, cleanup, within } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tick } from 'svelte';
import CalendarToolbar from './CalendarToolbar.svelte';

function props(overrides = {}) {
	return {
		currentMonthYear: 'September 2026',
		currentYear: 2026,
		currentMonth: 9,
		months: ['January', 'February', 'March', 'April', 'May', 'June'],
		view: 'month' as const,
		selectionMode: false,
		addMode: false,
		dashboardDate: '2026-09-08',
		onToday: vi.fn(),
		onPrevious: vi.fn(),
		onNext: vi.fn(),
		onMonthSelect: vi.fn(),
		onYearSelect: vi.fn(),
		onViewChange: vi.fn(),
		onToggleSelectionMode: vi.fn(),
		onToggleAddMode: vi.fn(),
		calendars: [],
		hiddenCalendarIds: [],
		onToggleCalendar: vi.fn(),
		onSetAllHidden: vi.fn(),
		assignees: [],
		hiddenAssigneeIds: [],
		onToggleAssignee: vi.fn(),
		onShowAllAssignees: vi.fn(),
		searchQuery: '',
		onSearch: vi.fn(),
		searchMatches: null,
		searchTotal: null,
		isCurrentPeriod: false,
		...overrides
	};
}

describe('CalendarToolbar', () => {
	afterEach(cleanup);

	it('fires nav callbacks', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		await fireEvent.click(screen.getByText('Today'));
		expect(p.onToday).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByLabelText('Previous period'));
		expect(p.onPrevious).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByLabelText('Next period'));
		expect(p.onNext).toHaveBeenCalledOnce();
	});

	it('fires onViewChange when a view button is clicked', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		await fireEvent.click(screen.getByText('Week'));
		expect(p.onViewChange).toHaveBeenCalledWith('week');
	});

	it('opens the mini picker and fires onMonthSelect', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		await fireEvent.click(screen.getByText('September 2026'));
		await fireEvent.click(screen.getByText('Mar'));
		expect(p.onMonthSelect).toHaveBeenCalledWith(3);
	});

	it('toggles selection mode with pressed state', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		const btn = screen.getByTitle('Select events to edit in bulk');
		expect(btn.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(btn);
		expect(p.onToggleSelectionMode).toHaveBeenCalledWith(true);
	});

	it('toggles add mode with pressed state (#047)', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		const btn = screen.getByTitle('Add by dragging a time range');
		expect(btn.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(btn);
		expect(p.onToggleAddMode).toHaveBeenCalledWith(true);
	});
});

// #069 — colour has always meant "this event's calendar", but there was no
// way to act on it. These pin the toolbar's half of the filter; the state and
// persistence live in Calendar.svelte + calendarVisibility.ts.
describe('CalendarToolbar calendar filter (#069)', () => {
	afterEach(cleanup);

	const calendars = [
		{ id: 'cal-personal', name: 'Personal Calendar', color: '#fa8072' },
		{ id: 'cal-family', name: 'Smith Family', color: '#e0ffff' }
	];

	const open = async (p: ReturnType<typeof props>) => {
		render(CalendarToolbar, { props: p });
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
	};

	it('stays closed until asked, and reports its state on the trigger', async () => {
		const p = props({ calendars, hiddenCalendarIds: ['cal-family'] });
		render(CalendarToolbar, { props: p });
		const trigger = screen.getByTestId('calendar-filter-trigger');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger).toHaveTextContent('1');
		expect(screen.queryByTestId('calendar-filter-panel')).toBeNull();
	});

	it('lists every calendar with a switch that reads its visibility', async () => {
		const p = props({ calendars, hiddenCalendarIds: ['cal-family'] });
		await open(p);
		expect(screen.getByTestId('calendar-filter-panel')).toBeInTheDocument();
		const personal = screen.getByRole('switch', { name: /Personal Calendar/ });
		const family = screen.getByRole('switch', { name: /Smith Family/ });
		expect(personal.getAttribute('aria-checked')).toBe('true');
		expect(family.getAttribute('aria-checked')).toBe('false');
	});

	it('fires onToggleCalendar with the calendar id', async () => {
		const p = props({ calendars, hiddenCalendarIds: [] });
		await open(p);
		await fireEvent.click(screen.getByRole('switch', { name: /Smith Family/ }));
		expect(p.onToggleCalendar).toHaveBeenCalledWith('cal-family');
	});

	it('does one tap for hide all / show all', async () => {
		const p = props({ calendars, hiddenCalendarIds: [] });
		await open(p);
		const all = screen.getByTestId('calendar-filter-all');
		expect(all).toHaveTextContent('Hide all');
		await fireEvent.click(all);
		expect(p.onSetAllHidden).toHaveBeenCalledWith(true);

		cleanup();
		const q = props({ calendars, hiddenCalendarIds: ['cal-personal', 'cal-family'] });
		render(CalendarToolbar, { props: q });
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		await fireEvent.click(screen.getByTestId('calendar-filter-all'));
		expect(q.onSetAllHidden).toHaveBeenCalledWith(false);
	});

	it('marks a hidden calendar by shape and mute, never by hue alone', async () => {
		const p = props({ calendars, hiddenCalendarIds: ['cal-family'] });
		await open(p);
		const family = screen.getByRole('switch', { name: /Smith Family/ });
		const personal = screen.getByRole('switch', { name: /Personal Calendar/ });
		expect(family.className).not.toBe(personal.className);
		// The calendar's own colour still rides the dot in both states.
		expect(family.innerHTML).toContain('#e0ffff');
	});

	it('closes on Escape and on an outside click', async () => {
		const p = props({ calendars, hiddenCalendarIds: [] });
		await open(p);
		expect(screen.getByTestId('calendar-filter-panel')).toBeInTheDocument();
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(screen.queryByTestId('calendar-filter-panel')).toBeNull();

		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		await fireEvent.click(document.body);
		expect(screen.queryByTestId('calendar-filter-panel')).toBeNull();
	});
	it('says so when there is no calendar to filter', async () => {
		const p = props({ calendars: [], hiddenCalendarIds: [] });
		render(CalendarToolbar, { props: p });
		expect(screen.queryByTestId('calendar-filter-trigger')).toBeNull();
	});
});

/**
 * #120 — three marks, one component.
 *
 * 1.16 "center this" (the month label), 1.17 "put on either side of the today
 * button and make it a single item with buttons in it" (the arrow pair), and
 * 1.15 "move this to the line below this" (search). 1.16 and 1.17 are one
 * complaint: the date navigation was three loose pieces. It is now one control,
 * and the toolbar has two rows.
 */
describe('CalendarToolbar — one centred date control (#120)', () => {
	afterEach(cleanup);

	it('holds the label, both arrows and Today inside ONE control', async () => {
		render(CalendarToolbar, { props: props() });
		const nav = within(screen.getByTestId('date-nav'));
		// All four pieces are the same object now, not three siblings.
		nav.getByText('September 2026');
		nav.getByRole('button', { name: 'Previous period' });
		nav.getByRole('button', { name: 'Next period' });
		nav.getByRole('button', { name: 'Go to today' });
	});

	it('puts the label first, then the SHARED control in its own order', () => {
		// "put on either side of the today button" (1.17) was read literally at
		// first and the toolbar grew its own ‹ Today ›. Adopting DayNav (#119)
		// means the shared order instead: Today leads, because it is the way
		// back and the arrows are the way along. The label still comes first —
		// it is what names the period. One control, one order, no second copy.
		render(CalendarToolbar, { props: props() });
		const nav = screen.getByTestId('date-nav');
		const names = [...nav.querySelectorAll('button')].map((b) =>
			b.getAttribute('aria-label') === null ? b.textContent?.trim() : b.getAttribute('aria-label')
		);
		expect(names).toEqual(['September 2026', 'Go to today', 'Previous period', 'Next period']);
	});

	it('centres that control with equal columns either side of it', () => {
		// `1fr auto 1fr` is what makes "centred" true rather than hoped for:
		// whatever the view toggle and the action strip weigh, the middle
		// column is the centre of the toolbar.
		render(CalendarToolbar, { props: props() });
		const row = screen.getByTestId('toolbar-controls-row');
		expect(row.className).toContain('min-[1150px]:grid-cols-[1fr_auto_1fr]');
		expect(row.children[1]).toBe(screen.getByTestId('date-nav'));
	});

	/**
	 * #128 gap 7 — "three columns where E is not until 1150px".
	 *
	 * Measured, not argued: at 768px the app's `1fr auto 1fr` left the Filters
	 * trigger **16px wide** in a browser, because the action strip was clipped
	 * by its own `min-w-0` column. E's row is `1fr auto` — the date control on
	 * its own row, the toggle and the actions sharing the one under it — until
	 * 1150px, the width the three columns actually need.
	 */
	it('stacks the date control on its own row until 1150px, not until sm', () => {
		render(CalendarToolbar, { props: props() });
		const row = screen.getByTestId('toolbar-controls-row');
		// Two columns below 1150: the toggle at its own width, the actions in
		// the rest. NOT `1fr auto` — the toggle carries `min-w-0`, and as a `1fr`
		// (floor = min-content = 0) it measured 0px wide at 375 and pushed the
		// whole strip past the screen.
		expect(row.className).toContain('grid-cols-[auto_minmax(0,1fr)]');
		// …and NO bare three-column rule at `sm` or `md`.
		expect(row.className).not.toMatch(/(^|\s)sm:grid-cols-/);
		expect(row.className).not.toMatch(/(^|\s)md:grid-cols-/);
	});

	it('puts the date control on its own row, spanning both columns, below 1150px', () => {
		render(CalendarToolbar, { props: props() });
		const row = screen.getByTestId('toolbar-controls-row');
		const nav = screen.getByTestId('date-nav');
		// row 1, spanning; the toggle and the actions sit under it either side.
		expect(nav.className).toMatch(/col-span-2/);
		expect(nav.className).toMatch(/row-start-1/);
		expect(nav.className).toMatch(/min-\[1150px\]:col-span-1/);
		// The toggle leads in the DOM and takes row 2's first column.
		expect(row.children[0].className).toMatch(/col-start-1/);
		expect(row.children[2].className).toMatch(/col-start-2/);
	});

	it('still fires every nav callback out of the joined control', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		const nav = within(screen.getByTestId('date-nav'));
		await fireEvent.click(nav.getByRole('button', { name: 'Go to today' }));
		await fireEvent.click(nav.getByRole('button', { name: 'Previous period' }));
		await fireEvent.click(nav.getByRole('button', { name: 'Next period' }));
		expect(p.onToday).toHaveBeenCalledOnce();
		expect(p.onPrevious).toHaveBeenCalledOnce();
		expect(p.onNext).toHaveBeenCalledOnce();
	});

	it('opens the month picker from the label inside the control', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		await fireEvent.click(within(screen.getByTestId('date-nav')).getByText('September 2026'));
		await fireEvent.click(screen.getByText('Mar'));
		expect(p.onMonthSelect).toHaveBeenCalledWith(3);
	});
});

/**
 * #119 item 6 — the drift #118 was filed to prevent.
 *
 * 118 extracted `DayNav.svelte` so the dashboard header and the calendar header
 * could not drift apart again. But the calendar toolbar still hand-built its own
 * ‹ Today › beside the month label, so the drift was live: two "Today"
 * controls, two label sets, two z-index stories. A third copy is how it started.
 *
 * So the toolbar mounts the shared control and names the period inside its own
 * pill. These are the pins: a second navigator cannot be added without failing.
 */
describe('CalendarToolbar adopts the shared DayNav (#119)', () => {
	afterEach(cleanup);

	it('mounts DayNav rather than hand-building its own arrows', () => {
		render(CalendarToolbar, { props: props() });
		const nav = screen.getByTestId('daynav');
		// the shared control IS the toolbar's date control, not a neighbour
		expect(screen.getByTestId('date-nav').contains(nav)).toBe(true);
	});

	it('has exactly one navigation landmark, so there is one date control to drift', () => {
		render(CalendarToolbar, { props: props() });
		expect(document.querySelectorAll('nav')).toHaveLength(1);
		expect(screen.getByRole('navigation', { name: 'Period navigation' })).toBeTruthy();
	});

	it("takes the shared labels, not the calendar page's private ones", () => {
		// "Previous" alone could be a day, a week or a month. The shared control
		// names the period in the label; the toolbar inherits that for free.
		render(CalendarToolbar, { props: props() });
		expect(screen.queryByLabelText('Previous')).toBeNull();
		expect(screen.queryByLabelText('Next')).toBeNull();
		expect(screen.getByLabelText('Previous period')).toBeTruthy();
		expect(screen.getByLabelText('Next period')).toBeTruthy();
	});

	it('carries one ring only — the label is a segment of the pill, not a pill', () => {
		render(CalendarToolbar, { props: props() });
		const pill = screen.getByTestId('daynav');
		// the toolbar's own wrapper positions it and carries no ring of its own
		const wrapper = screen.getByTestId('date-nav');
		expect(wrapper.className).not.toMatch(/\bborder\b/);
		for (const member of pill.children) {
			expect(member.className).not.toMatch(/\bborder\b/);
		}
	});

	it('says where it already is when the period on screen is this one', () => {
		// DayNav can say "you are on today". A hand-built copy never could, which
		// is the other half of the drift: the shared control has affordances the
		// copy did not.
		render(CalendarToolbar, { props: props({ isCurrentPeriod: true }) });
		const today = screen.getByRole('button', { name: 'Go to today' });
		expect(today.getAttribute('aria-current')).toBe('date');
	});

	it('leaves Today a live control when the period on screen is another one', () => {
		render(CalendarToolbar, { props: props({ isCurrentPeriod: false }) });
		const today = screen.getByRole('button', { name: 'Go to today' });
		expect(today.hasAttribute('aria-current')).toBe(false);
		expect(today.hasAttribute('disabled')).toBe(false);
	});
});

describe('CalendarToolbar — search on the second row (#120, mark 1.15)', () => {
	afterEach(cleanup);

	it('puts a full-width field on its own row, below the controls', () => {
		render(CalendarToolbar, { props: props() });
		const controls = screen.getByTestId('toolbar-controls-row');
		const search = screen.getByTestId('toolbar-search-row');
		// Below, not beside: the complaint was the row it was on, not its size.
		expect(
			controls.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		// …and it takes the whole width, at every screen size.
		expect(search.className).toMatch(/\bw-full\b/);
	});

	it('names what it searches, and is reachable by keyboard', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		const input = screen.getByRole('searchbox');
		expect(input).toHaveAttribute('aria-label', 'Search events');
		await fireEvent.input(input, { target: { value: 'piano' } });
		expect(p.onSearch).toHaveBeenCalledWith('piano');
	});

	it('opens on ⌘K and on Ctrl+K — the shortcut still works', async () => {
		render(CalendarToolbar, { props: props() });
		// SAFETY: role `searchbox` is only ever the <input type="search"> above.
		const input = screen.getByRole('searchbox') as HTMLInputElement;
		await fireEvent.keyDown(window, { key: 'k', metaKey: true });
		await tick();
		expect(document.activeElement).toBe(input);
		// SAFETY: the only focusable thing in this render is the field, so
		// activeElement is either it or null, and blur() is what takes it back.
		(document.activeElement as HTMLElement | null)?.blur();
		await fireEvent.keyDown(window, { key: 'K', ctrlKey: true });
		await tick();
		expect(document.activeElement).toBe(input);
	});

	it('does not hijack the letter k while you are typing in the field', async () => {
		const p = props();
		render(CalendarToolbar, { props: p });
		// SAFETY: role `searchbox` is only ever the <input type="search"> above.
		const input = screen.getByRole('searchbox') as HTMLInputElement;
		input.focus();
		await fireEvent.keyDown(input, { key: 'k' });
		await fireEvent.input(input, { target: { value: 'k' } });
		await tick();
		// The letter went into the field. No shortcut fired, no focus stolen.
		expect(input.value).toBe('k');
		expect(document.activeElement).toBe(input);
		expect(p.onSearch).toHaveBeenCalledTimes(1);
		expect(p.onSearch).toHaveBeenCalledWith('k');
	});

	it('says the shortcut on screen, so it is discoverable not just documented', () => {
		render(CalendarToolbar, { props: props() });
		// The hint is visible text, not a title attribute nobody sees.
		expect(screen.getByTestId('search-shortcut-hint')).toHaveTextContent('⌘K');
	});

	it('names what a query kept, and offers the way back', async () => {
		const p = props({ searchQuery: 'piano', searchMatches: 1, searchTotal: 12 });
		render(CalendarToolbar, { props: p });
		const status = screen.getByTestId('search-status');
		expect(status).toHaveTextContent('1 of 12');
		await fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
		expect(p.onSearch).toHaveBeenCalledWith('');
	});

	it('shows no status at all when nothing is being searched', () => {
		render(CalendarToolbar, { props: props() });
		expect(screen.queryByTestId('search-status')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
	});
});

/**
 * #119 mark 1.4 — "calendars should be a modal that opens from a button".
 *
 * E opens ONE surface at every width: a bottom sheet on a phone and the SAME
 * sheet, centred, from 640px. The app opened a bottom sheet below 768px and an
 * anchored popover above it, so on a 768px tablet — the width #119 mark 1.14
 * argued hardest about — the filter was a 16rem popover hanging off a trigger
 * the same layout had clipped to 16px wide (measured, not argued).
 *
 * jsdom has no layout, so the breakpoint cannot be exercised by resizing. The
 * shape is expressed in the one place it can be — the panel's own classes —
 * and these pin both halves of it, so neither can be quietly deleted.
 */
describe('CalendarToolbar calendar filter — a sheet on a phone, the same sheet centred (#119, #128 gap 8)', () => {
	afterEach(cleanup);

	const calendars = [
		{ id: 'cal-personal', name: 'Personal Calendar', color: '#fa8072' },
		{ id: 'cal-family', name: 'Smith Family', color: '#e0ffff' }
	];

	it('is a bottom sheet below sm and the SAME sheet, centred, from sm up', async () => {
		render(CalendarToolbar, { props: props({ calendars }) });
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		const cls = screen.getByTestId('calendar-filter-panel').className;
		// the sheet: pinned to the bottom of the screen, edge to edge
		expect(cls).toMatch(/\bfixed\b/);
		expect(cls).toMatch(/\binset-x-0\b/);
		expect(cls).toMatch(/\bbottom-0\b/);
		// the same sheet, centred from 640px — E's 26rem, not an anchored popover
		expect(cls).toMatch(/sm:left-1\/2/);
		expect(cls).toMatch(/sm:top-1\/2/);
		expect(cls).toMatch(/sm:w-\[26rem\]/);
		expect(cls).toMatch(/sm:-translate-x-1\/2/);
		expect(cls).toMatch(/sm:-translate-y-1\/2/);
		expect(cls).toMatch(/sm:rounded-3xl/);
		// …and the anchored popover is gone at every width, not just below.
		expect(cls).not.toMatch(/\babsolute\b/);
		expect(cls).not.toMatch(/md:right-4/);
		expect(cls).not.toMatch(/md:top-full/);
	});

	it('caps the centred sheet so it cannot run off a 640px screen', async () => {
		render(CalendarToolbar, { props: props({ calendars }) });
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		expect(screen.getByTestId('calendar-filter-panel').className).toMatch(
			/sm:max-w-\[calc\(100vw-2rem\)\]/
		);
	});

	it('titles the sheet and closes it from one place at every width', async () => {
		// The app's close button lived inside the Calendars group and was
		// `md:hidden`, so with no calendars to list there was no way out of the
		// sheet but Escape and the backdrop.
		render(CalendarToolbar, {
			props: props({
				calendars: [],
				assignees: [{ id: 'u-mia', name: 'Mia', isViewer: false, count: 1 }]
			})
		});
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		const panel = screen.getByTestId('calendar-filter-panel');
		expect(within(panel).getByRole('heading', { name: 'Filters' })).toBeTruthy();
		const close = screen.getByRole('button', { name: 'Close calendar filter' });
		expect(close.className).not.toMatch(/md:hidden/);
		await fireEvent.click(close);
		expect(screen.queryByTestId('calendar-filter-panel')).toBeNull();
	});

	it('dismisses on the backdrop at every width, not only below md', async () => {
		render(CalendarToolbar, { props: props({ calendars }) });
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		const backdrop = screen.getByTestId('calendar-filter-backdrop');
		expect(backdrop.className).not.toMatch(/md:hidden/);
		await fireEvent.click(backdrop);
		expect(screen.queryByTestId('calendar-filter-panel')).toBeNull();
	});

	it('is a labelled dialog with a close button, not a bare popover', async () => {
		render(CalendarToolbar, { props: props({ calendars }) });
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		const panel = screen.getByTestId('calendar-filter-panel');
		expect(panel.getAttribute('role')).toBe('dialog');
		// #127: the panel holds two axes now, so it is no longer "Calendars" —
		// the name would be a lie with a second filter sitting under it.
		expect(panel.getAttribute('aria-label')).toBe('Filters');
		await fireEvent.click(screen.getByRole('button', { name: 'Close calendar filter' }));
		expect(screen.queryByTestId('calendar-filter-panel')).toBeNull();
	});

	it('closes on the backdrop, so a phone has somewhere to tap away', async () => {
		render(CalendarToolbar, { props: props({ calendars }) });
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		expect(screen.getByTestId('calendar-filter-backdrop')).toBeInTheDocument();
		await fireEvent.click(screen.getByTestId('calendar-filter-backdrop'));
		expect(screen.queryByTestId('calendar-filter-panel')).toBeNull();
	});

	it('still toggles a calendar from inside the sheet', async () => {
		const p = props({ calendars, hiddenCalendarIds: [] });
		render(CalendarToolbar, { props: p });
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		await fireEvent.click(screen.getByRole('switch', { name: /Smith Family/ }));
		expect(p.onToggleCalendar).toHaveBeenCalledWith('cal-family');
	});
});

/**
 * #127 mark 1.11 — "by person is unneeded on mobile and should be filter buttons".
 *
 * The rail card was a list of names and counts you could read and not act on.
 * It is a filter now, and the mark is specific about where: "in the same sheet
 * as Calendars — same question, two axes". So these pin that it is the SAME
 * panel (not a new surface), that each row is a control with a value, and that
 * the shape works at 320px — the premise of the mark was that a rail card was
 * the wrong shape on a phone, and a grid of avatars would be the same mistake
 * wearing a filter's clothes.
 */
describe('CalendarToolbar — by person is a filter inside the Filters sheet (#127, mark 1.11)', () => {
	afterEach(cleanup);

	const calendars = [
		{ id: 'cal-personal', name: 'Personal Calendar', color: '#fa8072' },
		{ id: 'cal-family', name: 'Smith Family', color: '#e0ffff' }
	];
	const assignees = [
		{ id: 'u-sarah', name: 'You', isViewer: true, count: 18 },
		{ id: 'u-mia', name: 'Mia', isViewer: false, count: 14 },
		{ id: 'u-eli', name: 'Eli', isViewer: false, count: 0 }
	];

	/** The two things these tests vary about the person axis. Named, not an
	 *  open dictionary: an override bag with no contract is how a fixture
	 *  starts lying about what the component was given. */
	interface SheetOverrides {
		assignees?: typeof assignees;
		hiddenAssigneeIds?: string[];
	}

	const open = async (over: SheetOverrides = {}) => {
		const p = props({ calendars, assignees, hiddenAssigneeIds: [], ...over });
		render(CalendarToolbar, { props: p });
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		return p;
	};

	it('puts the rows in the SAME panel as the calendars, not on a surface of its own', async () => {
		await open();
		const panel = screen.getByTestId('calendar-filter-panel');
		// One dialog, two axes. A second sheet would be the "new surface" the
		// mark explicitly did not ask for.
		expect(document.querySelectorAll('[data-testid="calendar-filter-panel"]')).toHaveLength(1);
		expect(within(panel).getByRole('switch', { name: /Smith Family/ })).toBeTruthy();
		expect(within(panel).getByRole('button', { name: /^Mia,/ })).toBeTruthy();
	});

	it('makes each person a toggle button carrying its own state, the way a filter row is', async () => {
		const p = await open({ hiddenAssigneeIds: ['u-mia'] });
		const on = screen.getByRole('button', { name: /^You,/ });
		const off = screen.getByRole('button', { name: /^Mia,/ });
		expect(on.getAttribute('aria-pressed')).toBe('true');
		expect(off.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(off);
		expect(p.onToggleAssignee).toHaveBeenCalledWith('u-mia');
	});

	it('counts what each person would keep, and says 0 rather than hiding the row', async () => {
		// The counts come from the already-filtered rows, so 0 is the REASON a
		// filtered grid is empty — and the row must stay switchable to get out.
		await open();
		expect(screen.getByRole('button', { name: /^You,/ })).toHaveTextContent('18');
		expect(screen.getByRole('button', { name: /^Eli,/ })).toHaveTextContent('0');
	});

	it('marks an off row by shape and mute, never by hue alone', async () => {
		await open({ hiddenAssigneeIds: ['u-mia'] });
		const off = screen.getByRole('button', { name: /^Mia,/ });
		const on = screen.getByRole('button', { name: /^You,/ });
		expect(off.className).not.toBe(on.className);
		expect(off.innerHTML).toContain('line-through');
	});

	it('brings everyone back in one tap, and says so only while somebody is off', async () => {
		const p = await open({ hiddenAssigneeIds: ['u-mia'] });
		const all = screen.getByRole('button', { name: 'Show everyone' });
		await fireEvent.click(all);
		expect(p.onShowAllAssignees).toHaveBeenCalledOnce();
		cleanup();
		await open({ hiddenAssigneeIds: [] });
		expect(screen.queryByRole('button', { name: 'Show everyone' })).toBeNull();
	});

	it('works at 320px: one full-width column, a thumb-sized row, a truncating name', async () => {
		await open();
		const section = screen.getByTestId('assignee-filter');
		// No column track anywhere: a two-up grid of avatars is the rail card
		// again, just with a filter's name on it.
		expect(section.className).not.toMatch(/grid-cols-/);
		for (const row of screen.getAllByTestId('assignee-row')) {
			expect(row.className).toMatch(/\bw-full\b/);
			expect(row.className).toMatch(/min-h-11/);
			expect(row.className).not.toMatch(/min-w-\[/);
		}
		// The name truncates rather than pushing the row past the screen.
		expect(screen.getByRole('button', { name: /^You,/ }).innerHTML).toContain('truncate');
	});

	it('says so when there is nobody to filter by, rather than rendering nothing', async () => {
		await open({ assignees: [] });
		expect(screen.getByTestId('assignee-nobody')).toHaveTextContent('Nobody');
		expect(screen.queryAllByTestId('assignee-row')).toHaveLength(0);
	});

	it('shows the trigger for a person filter even with no calendar to list', async () => {
		const p = props({ calendars: [], assignees, hiddenAssigneeIds: [] });
		render(CalendarToolbar, { props: p });
		expect(screen.getByTestId('calendar-filter-trigger')).toBeInTheDocument();
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		expect(screen.getByTestId('assignee-filter')).toBeInTheDocument();
	});

	it('counts hidden people on the trigger badge beside hidden calendars', async () => {
		const p = props({
			calendars,
			assignees,
			hiddenCalendarIds: ['cal-family'],
			hiddenAssigneeIds: ['u-mia', 'u-eli']
		});
		render(CalendarToolbar, { props: p });
		// One filter button, one number: a filter that hides half your week
		// must not be invisible, whichever axis did it.
		expect(screen.getByTestId('calendar-filter-trigger')).toHaveTextContent('3');
	});
});

/**
 * #128 gap 3 — "Filters button carries no word".
 *
 * E's trigger is `icon + "Filters" + count`, and the word is hidden only below
 * 640px. The app's was `w-11` — a 44px icon box whose only name was an
 * `aria-label` nobody sees — with the count floating outside it in an
 * absolutely-positioned badge that had to be nudged back inside the toolbar
 * edge by half a pixel.
 */
describe('CalendarToolbar — the Filters button names itself (#128 gap 3)', () => {
	afterEach(cleanup);

	const calendars = [{ id: 'cal-personal', name: 'Personal Calendar', color: '#fa8072' }];

	it('carries the word Filters, not only an icon', () => {
		render(CalendarToolbar, { props: props({ calendars }) });
		const trigger = screen.getByTestId('calendar-filter-trigger');
		expect(trigger).toHaveTextContent('Filters');
		// Screen-reader-only below 640px, like every other toolbar word: the
		// button is never unlabelled, it is just quiet on a phone.
		expect(trigger.querySelector('[data-testid="filters-label"]')?.className).toMatch(
			/sr-only sm:not-sr-only/
		);
		// …and it is no longer a fixed 44px square.
		expect(trigger.className).not.toMatch(/\bw-11\b/);
	});

	it('puts the count in line with the word, not floating over the toolbar edge', () => {
		render(CalendarToolbar, {
			props: props({ calendars, hiddenCalendarIds: ['cal-personal'] })
		});
		const trigger = screen.getByTestId('calendar-filter-trigger');
		// E draws the badge INSIDE the button, after the word. Absolutely
		// positioning it needed a half-pixel nudge back inside the toolbar edge.
		expect(trigger.className).toMatch(/\brelative\b/);
		expect(screen.getByTestId('calendar-filter-badge').className).not.toMatch(/\babsolute\b/);
		expect(screen.getByTestId('calendar-filter-badge').className).toMatch(/\bflex\b/);
	});

	it('shows no count when nothing is hidden', () => {
		render(CalendarToolbar, { props: props({ calendars, hiddenCalendarIds: [] }) });
		expect(screen.queryByTestId('calendar-filter-badge')).toBeNull();
	});
});
