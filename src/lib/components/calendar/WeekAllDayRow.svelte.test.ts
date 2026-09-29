import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import WeekAllDayRow from './WeekAllDayRow.svelte';
import type { Event } from '$lib/types';

const MONDAY = DateTime.fromISO('2026-09-07T12:00:00');
const weekDays = Array.from({ length: 7 }, (_, i) => MONDAY.plus({ days: i }));

// SAFETY: fixture covers the Event fields WeekAllDayRow renders; auditing
// columns are irrelevant here.

const evt = {
	id: 'e1',
	ownerId: 'u1',
	calendarId: 'cal1',
	title: 'Holiday',
	date: '2026-09-08',
	start: '2026-09-08T00:00:00',
	end: '2026-09-08T23:59:00',
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

// SAFETY: WeekAllDayRow reads only id/title/dueDate off tasks.
const task = { id: 't1', title: 'Buy milk', dueDate: '2026-09-08' } as never;

describe('WeekAllDayRow', () => {
	afterEach(cleanup);

	it('renders all-day events + tasks and fires clicks', async () => {
		const props = {
			weekDays,
			eventsForDay: (d: DateTime) => (d.toISODate() === '2026-09-08' ? [evt] : []),
			tasksForDay: (d: DateTime) => (d.toISODate() === '2026-09-08' ? [task] : []),
			selectionMode: false,
			isSelected: () => false,
			onEventClick: vi.fn(),
			onOpenTask: vi.fn()
		};
		render(WeekAllDayRow, { props });
		await fireEvent.click(screen.getByText('Holiday'));
		expect(props.onEventClick).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByText('Buy milk'));
		expect(props.onOpenTask).toHaveBeenCalledOnce();
	});
});

// #068 — the week band is also a glyph view: its gutter header already reads
// "All day" for every column, so a word per chip would be pure repetition.
describe('WeekAllDayRow chip vocabulary', () => {
	afterEach(cleanup);

	const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);

	it('marks all-day events and tasks with the shared treatments', () => {
		render(WeekAllDayRow, {
			props: {
				weekDays,
				eventsForDay: (d: DateTime) => (d.toISODate() === '2026-09-08' ? [evt] : []),
				tasksForDay: (d: DateTime) => (d.toISODate() === '2026-09-08' ? [task] : []),
				selectionMode: false,
				isSelected: () => false,
				onEventClick: vi.fn(),
				onOpenTask: vi.fn()
			}
		});
		expect(mark('allDay')).toBeTruthy();
		expect(mark('task')).toBeTruthy();
	});

	it('carries the kind without a per-chip word', () => {
		render(WeekAllDayRow, {
			props: {
				weekDays,
				eventsForDay: (d: DateTime) => (d.toISODate() === '2026-09-08' ? [evt] : []),
				tasksForDay: () => [],
				selectionMode: false,
				isSelected: () => false,
				onEventClick: vi.fn(),
				onOpenTask: vi.fn()
			}
		});
		expect(mark('allDay')?.querySelector('[data-chip-a11y]')?.textContent).toBe('All day');
		expect(mark('allDay')?.querySelector('[data-chip-word]')).toBeNull();
	});
});
