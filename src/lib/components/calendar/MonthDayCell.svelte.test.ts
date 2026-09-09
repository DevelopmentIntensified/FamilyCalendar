import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import type { Event } from '$lib/types';
import MonthDayCell from './MonthDayCell.svelte';
import type { CalendarTask } from './TaskDetailModal.svelte';

const evt = (id: string, title: string): Event => ({
	id,
	calendarId: 'cal1',
	ownerId: 'user1',
	title,
	date: '2026-09-09T10:00:00',
	start: '2026-09-09T10:00:00',
	end: '2026-09-09T11:00:00',
	description: null,
	location: null,
	allDay: false,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	reminderMinutes: null,
	created_at: new Date('2026-09-01T00:00:00Z')
});

const task = (id: string): CalendarTask => ({
	id,
	title: `Task ${id}`,
	dueDate: '2026-09-09T10:00:00',
	recurrenceFrequency: null
});

const base = {
	day: 9,
	cellDate: DateTime.fromISO('2026-09-09'),
	isTodayDate: false,
	isOtherMonth: false,
	smallScreen: false,
	selectionMode: false,
	calendars: [],
	isSelected: () => false,
	onCellTap: () => {},
	onAdd: () => {},
	onEventClick: () => {},
	onToggleSelect: () => {},
	onTaskClick: () => {},
	onOverflow: () => {}
};

afterEach(cleanup);

describe('MonthDayCell', () => {
	it('renders the day number + event and task chips', () => {
		render(MonthDayCell, {
			props: { ...base, dayEvents: [evt('e1', 'Dentist')], dayTasks: [task('t1')] }
		});
		expect(screen.getByRole('button', { name: 'Open 09-09-2026' })).toBeInTheDocument();
		expect(screen.getByText('Dentist')).toBeInTheDocument();
		expect(screen.getByText('Task t1')).toBeInTheDocument();
	});

	it('caps chips at 3 events + 2 tasks with a +N more button', () => {
		const onOverflow = vi.fn();
		render(MonthDayCell, {
			props: {
				...base,
				dayEvents: [evt('e1', 'A'), evt('e2', 'B'), evt('e3', 'C'), evt('e4', 'D')],
				dayTasks: [task('t1'), task('t2'), task('t3')],
				onOverflow
			}
		});
		expect(screen.queryByText('D')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: '+2 more' })).toBeInTheDocument();
	});

	it('forwards event clicks and selection toggles', async () => {
		const onEventClick = vi.fn();
		const { unmount } = render(MonthDayCell, {
			props: { ...base, dayEvents: [evt('e1', 'Dentist')], dayTasks: [], onEventClick }
		});
		await fireEvent.click(screen.getByText('Dentist'));
		expect(onEventClick).toHaveBeenCalledOnce();
		unmount();

		const onToggleSelect = vi.fn();
		render(MonthDayCell, {
			props: {
				...base,
				dayEvents: [evt('e1', 'Dentist')],
				dayTasks: [],
				selectionMode: true,
				onToggleSelect
			}
		});
		await fireEvent.click(screen.getByText('Dentist'));
		expect(onToggleSelect).toHaveBeenCalledOnce();
	});

	it('forwards the add affordance with the cell date', async () => {
		const onAdd = vi.fn();
		render(MonthDayCell, { props: { ...base, dayEvents: [], dayTasks: [], onAdd } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add on 09-09-2026' }));
		expect(onAdd).toHaveBeenCalledOnce();
	});
});
