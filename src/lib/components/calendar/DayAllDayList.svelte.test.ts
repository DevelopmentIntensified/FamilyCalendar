import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import DayAllDayList from './DayAllDayList.svelte';
import type { Event } from '$lib/types';

// SAFETY: fixture covers the Event fields DayAllDayList renders.
const evt = {
	id: 'e1',
	ownerId: 'u1',
	calendarId: 'cal1',
	title: 'Holiday',
	date: '2026-09-09',
	start: '2026-09-09T00:00:00',
	end: '2026-09-09T23:59:00',
	description: null,
	location: null,
	allDay: true,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	reminderMinutes: null,
	created_at: new Date('2026-01-01T00:00:00Z')
} as Event;

// SAFETY: DayAllDayList reads only id/title/dueDate/recurrence off tasks.
const task = { id: 't1', title: 'Buy milk', dueDate: '2026-09-09' } as never;

describe('DayAllDayList', () => {
	afterEach(cleanup);

	it('renders all-day events + tasks and fires clicks', async () => {
		const props = {
			allDayEvents: [evt],
			dayTasks: [task],
			selectionMode: false,
			isSelected: () => false,
			onEventClick: vi.fn(),
			onOpenTask: vi.fn()
		};
		render(DayAllDayList, { props });
		expect(screen.getByText('All day')).toBeInTheDocument();
		expect(screen.getByText('Tasks')).toBeInTheDocument();
		await fireEvent.click(screen.getByText('Holiday'));
		expect(props.onEventClick).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByText('Buy milk'));
		expect(props.onOpenTask).toHaveBeenCalledOnce();
	});

	it('renders nothing without events or tasks', () => {
		render(DayAllDayList, {
			props: {
				allDayEvents: [],
				dayTasks: [],
				selectionMode: false,
				isSelected: () => false,
				onEventClick: vi.fn(),
				onOpenTask: vi.fn()
			}
		});
		expect(screen.queryByText('All day')).not.toBeInTheDocument();
	});
});
