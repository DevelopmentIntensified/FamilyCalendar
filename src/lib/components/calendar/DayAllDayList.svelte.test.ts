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
		// #068: the section heading and each chip now both say "All day", so
		// the heading is matched by role rather than by text.
		expect(screen.getByRole('heading', { name: 'All day' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
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
		expect(screen.queryByRole('heading', { name: 'All day' })).not.toBeInTheDocument();
	});
});

// #068 — the day list is a word view: a full-width row has room, so the same
// all-day event that showed only a bar in the month cell here says "All day".
describe('DayAllDayList chip vocabulary', () => {
	afterEach(cleanup);

	const base = {
		selectionMode: false,
		isSelected: () => false,
		onEventClick: vi.fn(),
		onOpenTask: vi.fn()
	};
	const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);

	it('spells the kind out where the row has room', () => {
		render(DayAllDayList, { props: { ...base, allDayEvents: [evt], dayTasks: [task] } });
		expect(mark('allDay')?.querySelector('[data-chip-word]')?.textContent).toBe('All day');
		expect(mark('allDay')?.querySelector('[data-chip-a11y]')).toBeNull();
		expect(mark('task')?.querySelector('[data-chip-word]')?.textContent).toBe('Task');
	});

	it('drops the translucent all-day fill so colour stays free for the calendar', () => {
		render(DayAllDayList, { props: { ...base, allDayEvents: [evt], dayTasks: [] } });
		const chip = screen.getByText('Holiday').closest('button');
		expect(chip?.getAttribute('style')).toContain('--chip-color');
		expect(chip?.getAttribute('style')).not.toMatch(/background(-color)?\s*:/);
		expect(chip?.getAttribute('style')).not.toContain('border-left');
	});
});

// #067 — the day list is a WORD view, so the ad names itself in plain sight:
// the same `Ad` the month cell can only hint at, from the one vocabulary.
describe('DayAllDayList names a sponsored event', () => {
	afterEach(cleanup);

	const base = {
		dayTasks: [],
		selectionMode: false,
		isSelected: () => false,
		onEventClick: vi.fn(),
		onOpenTask: vi.fn()
	};
	const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);
	const ad = { ...evt, id: 'e2', title: 'Toy drive', isAd: true } as Event;

	it('shows the word on an all-day ad', () => {
		render(DayAllDayList, { props: { ...base, allDayEvents: [ad] } });
		expect(mark('sponsored')?.querySelector('[data-chip-word]')?.textContent).toBe('Ad');
		// An ad outranks all-day, so the CHIP is not also called "All day"
		// (the section heading still is — that is where the chips live).
		expect(mark('allDay')).toBeNull();
		expect(screen.getAllByText('All day')).toHaveLength(1);
	});

	it('keeps the hatch neutral so the ad never reads as a calendar colour', () => {
		render(DayAllDayList, { props: { ...base, allDayEvents: [ad] } });
		const chip = screen.getByText('Toy drive').closest('button');
		expect(chip?.getAttribute('style')).toContain('repeating-linear-gradient');
		expect(chip?.className).not.toMatch(/amber/);
	});

	it('says no such thing about a plain all-day event', () => {
		render(DayAllDayList, { props: { ...base, allDayEvents: [evt] } });
		expect(mark('sponsored')).toBeNull();
		expect(screen.queryByText('Ad')).toBeNull();
	});
});
