import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import DayEventsModal from './DayEventsModal.svelte';
import type { Event } from '$lib/types';

afterEach(() => {
	cleanup();
});

function renderModal(date: string) {
	return render(DayEventsModal, {
		props: { show: true, date, events: [], calendars: [] }
	});
}

describe('DayEventsModal', () => {
	it('formats the "MM-dd-yyyy" date fed in by MonthDays (bug: header said "Invalid DateTime")', () => {
		renderModal('01-15-2024');
		const heading = screen.getByRole('heading', { level: 2 });
		expect(heading).toHaveTextContent('Monday, January 15, 2024');
	});

	it('also accepts ISO dates without breaking', () => {
		renderModal('2024-01-15');
		expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Monday, January 15, 2024');
	});

	it('renders an empty state when the day has no events', () => {
		renderModal('01-15-2024');
		expect(screen.getByText('No events for this day')).toBeInTheDocument();
	});

	it('notifies the parent on Close so "+N more" can reopen the modal', async () => {
		const onClose = vi.fn();
		render(DayEventsModal, {
			props: { show: true, date: '01-15-2024', events: [], calendars: [], onClose }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('notifies the parent on backdrop click too', async () => {
		const onClose = vi.fn();
		const { container } = render(DayEventsModal, {
			props: { show: true, date: '01-15-2024', events: [], calendars: [], onClose }
		});
		// Backdrop is the absolute inset button behind the panel.
		const backdrop = container.querySelector('.fixed .absolute.inset-0');
		expect(backdrop).not.toBeNull();
		await fireEvent.click(backdrop!);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('renders day tasks alongside events', () => {
		render(DayEventsModal, {
			props: {
				show: true,
				date: '01-15-2024',
				events: [],
				calendars: [],
				tasks: [{ id: 't1', title: 'Buy milk' }]
			}
		});
		expect(screen.getByText('Buy milk')).toBeInTheDocument();
		expect(screen.queryByText('No events for this day')).not.toBeInTheDocument();
	});

	it('notifies the parent when a task is tapped', async () => {
		const onTaskClick = vi.fn();
		render(DayEventsModal, {
			props: {
				show: true,
				date: '01-15-2024',
				events: [],
				calendars: [],
				tasks: [{ id: 't1', title: 'Buy milk' }],
				onTaskClick
			}
		});
		await fireEvent.click(screen.getByText('Buy milk'));
		expect(onTaskClick).toHaveBeenCalledTimes(1);
		expect(onTaskClick).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
	});
});

// SAFETY: fixture covers the Event fields DayEventsModal renders.
const evt = (over: Record<string, unknown> = {}) =>
	({
		id: 'e1',
		ownerId: 'u1',
		calendarId: 'cal1',
		title: 'Standup',
		date: '2024-01-15',
		start: '2024-01-15T10:00:00',
		end: '2024-01-15T11:00:00',
		description: null,
		location: null,
		allDay: false,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		color: '#0ea5e9',
		created_at: new Date('2024-01-01T00:00:00Z'),
		...over
	}) as Event;

const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);

// #067 — the modal is a WORD view (max-w-lg rows), but it had no vocabulary at
// all: a hand-rolled colour dot and a literal "All day". A sponsored event
// opened from a month cell's "+N more" was therefore completely unnamed.
describe('DayEventsModal names a sponsored event', () => {
	function renderEvents(events: Event[]) {
		return render(DayEventsModal, { props: { show: true, date: '01-15-2024', events, calendars: [] } });
	}

	it('shows the word for a TIMED ad', () => {
		renderEvents([evt({ id: 'ad', title: 'Toy drive', isAd: true })]);
		expect(mark('sponsored')?.querySelector('[data-chip-word]')?.textContent).toBe('Ad');
	});

	it('shows the word for an all-day ad, outranking the all-day word', () => {
		renderEvents([evt({ id: 'ad', title: 'Toy drive', isAd: true, allDay: true })]);
		expect(mark('sponsored')?.querySelector('[data-chip-word]')?.textContent).toBe('Ad');
		expect(mark('allDay')).toBeNull();
	});

	it('takes the word from the vocabulary, not a hand-rolled string', () => {
		renderEvents([evt({ allDay: true })]);
		expect(mark('allDay')?.querySelector('[data-chip-word]')?.textContent).toBe('All day');
		expect(screen.queryByText('Ad')).toBeNull();
	});

	it('leaves an ordinary timed event with a bare dot and no ad wording', () => {
		renderEvents([evt({ title: 'Standup' })]);
		expect(mark('timed')).toBeTruthy();
		expect(mark('timed')?.querySelector('[data-chip-word]')).toBeNull();
		expect(screen.queryByText('Ad')).toBeNull();
	});
});
