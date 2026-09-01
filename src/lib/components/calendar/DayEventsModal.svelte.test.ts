import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
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
});