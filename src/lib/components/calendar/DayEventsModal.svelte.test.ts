import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import DayEventsModal from './DayEventsModal.svelte';

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
});