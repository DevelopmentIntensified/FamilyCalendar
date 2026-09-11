import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import { writable } from 'svelte/store';
import WeekHourGrid from './WeekHourGrid.svelte';

const MONDAY = DateTime.fromISO('2026-09-07T12:00:00');
const weekDays = Array.from({ length: 7 }, (_, i) => MONDAY.plus({ days: i }));

function props(overrides = {}) {
	return {
		weekDays,
		hours: Array.from({ length: 24 }, (_, i) => i),
		currentDate: writable(MONDAY),
		moveError: '',
		isCurrentHour: () => false,
		eventsForDay: () => [],
		selecting: null,
		rangeSel: null,
		addMode: false,
		selectionMode: false,
		isSelected: () => false,
		calendarIds: [{ id: 'cal1', name: 'My Calendar' }],
		totalWeekItems: 1,
		rangeTouchAction: () => ({ update: () => {}, destroy: () => {} }),
		onColumnDrop: vi.fn(),
		onColumnClick: vi.fn(),
		onRangeMouseDown: vi.fn(),
		onRangeMouseMove: vi.fn(),
		onRangeMouseUp: vi.fn(),
		onStepRangeEnd: vi.fn(),
		onCreateRange: vi.fn(),
		onDismissRange: vi.fn(),
		onEventClick: vi.fn(),
		onDragStart: vi.fn(),
		...overrides
	};
}

describe('WeekHourGrid', () => {
	afterEach(cleanup);

	it('renders seven day columns and hour labels', () => {
		render(WeekHourGrid, { props: props() });
		expect(document.querySelectorAll('[data-testid="week-day-column"]')).toHaveLength(7);
		expect(screen.getByText('12 AM')).toBeInTheDocument();
		expect(screen.getByText('12 PM')).toBeInTheDocument();
	});

	it('shows the empty-week hint and surfaces move errors', () => {
		render(WeekHourGrid, { props: props({ totalWeekItems: 0, moveError: 'Nope' }) });
		expect(screen.getByText(/blank week is full of options/)).toBeInTheDocument();
		expect(screen.getByRole('alert')).toHaveTextContent('Nope');
	});
});
