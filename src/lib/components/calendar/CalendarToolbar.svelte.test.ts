import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
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
		await fireEvent.click(screen.getByLabelText('Previous'));
		expect(p.onPrevious).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByLabelText('Next'));
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
