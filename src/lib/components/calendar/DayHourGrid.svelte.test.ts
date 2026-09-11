import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import DayHourGrid from './DayHourGrid.svelte';
import type { Event } from '$lib/types';

const TUESDAY = DateTime.fromISO('2026-09-08T12:00:00');

// SAFETY: fixture covers the Event fields DayHourGrid renders.
const evt = {
	id: 'e1',
	ownerId: 'u1',
	calendarId: 'cal1',
	title: 'Standup',
	date: '2026-09-08',
	start: '2026-09-08T10:00:00',
	end: '2026-09-08T11:00:00',
	description: null,
	location: null,
	allDay: false,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	reminderMinutes: null,
	created_at: new Date('2026-01-01T00:00:00Z')
} as Event;

function props(overrides = {}) {
	return {
		pxPerHour: 56,
		gridHeight: 1344,
		selectedDate: TUESDAY,
		isToday: false,
		nowPct: 50,
		laidOut: [],
		selecting: null,
		rangeSel: null,
		addMode: false,
		selectionMode: false,
		isSelected: () => false,
		rangeTouchAction: () => ({ update: () => {}, destroy: () => {} }),
		onGridDrop: vi.fn(),
		onGridClick: vi.fn(),
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

describe('DayHourGrid', () => {
	afterEach(cleanup);

	it('renders the grid, hours and laid-out events', async () => {
		const p = props({
			laidOut: [{ event: evt, lane: 0, lanes: 1, topPct: 40, heightPct: 5 }]
		});
		render(DayHourGrid, { props: p });
		expect(screen.getByTestId('day-grid')).toBeInTheDocument();
		expect(screen.getByText('Standup')).toBeInTheDocument();
		await fireEvent.click(screen.getByText('Standup'));
		expect(p.onEventClick).toHaveBeenCalledOnce();
	});

	it('shows the range popover with working steppers', async () => {
		const p = props({
			rangeSel: { day: TUESDAY, startMin: 120, endMin: 240 }
		});
		render(DayHourGrid, { props: p });
		expect(screen.getByText('2:00 AM – 4:00 AM')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Extend by 15 minutes' }));
		expect(p.onStepRangeEnd).toHaveBeenCalledWith(15);
		await fireEvent.click(screen.getByRole('button', { name: 'Create event for selected time' }));
		expect(p.onCreateRange).toHaveBeenCalledOnce();
	});
});
