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
		expect(row.className).toContain('grid-cols-[1fr_auto_1fr]');
		expect(row.children[1]).toBe(screen.getByTestId('date-nav'));
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

	it('takes the shared labels, not the calendar page\'s private ones', () => {
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
		expect(controls.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
 * There is no rail column below 768px any more, so a card cannot live in one.
 * The filter is a BUTTON, and what it opens has to change shape with the
 * screen: a bottom sheet on a phone (a backdrop, a dismiss, room for a thumb)
 * and the popover it always was from `md` up.
 *
 * jsdom has no layout, so the breakpoint cannot be exercised by resizing. The
 * shape is expressed in the one place it can be — the panel's own classes —
 * and these pin both halves of it, so neither can be quietly deleted.
 */
describe('CalendarToolbar calendar filter — a sheet on a phone (#119)', () => {
	afterEach(cleanup);

	const calendars = [
		{ id: 'cal-personal', name: 'Personal Calendar', color: '#fa8072' },
		{ id: 'cal-family', name: 'Smith Family', color: '#e0ffff' }
	];

	it('is a bottom sheet below md and a popover from md up', async () => {
		render(CalendarToolbar, { props: props({ calendars }) });
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		const panel = screen.getByTestId('calendar-filter-panel');
		const cls = panel.className;
		// the sheet: pinned to the bottom of the screen, edge to edge
		expect(cls).toMatch(/\bfixed\b/);
		expect(cls).toMatch(/\binset-x-0\b/);
		expect(cls).toMatch(/\bbottom-0\b/);
		// the popover: back inside the toolbar, on the right
		expect(cls).toMatch(/md:absolute/);
		expect(cls).toMatch(/md:right-4/);
		expect(cls).toMatch(/md:top-full/);
		// …and the sheet must not leak either form into the other half.
		expect(cls).not.toMatch(/(?<!md:)\babsolute\b/);
	});

	it('is a labelled dialog with a close button, not a bare popover', async () => {
		render(CalendarToolbar, { props: props({ calendars }) });
		await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		const panel = screen.getByTestId('calendar-filter-panel');
		expect(panel.getAttribute('role')).toBe('dialog');
		expect(panel.getAttribute('aria-label')).toBe('Calendars');
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
