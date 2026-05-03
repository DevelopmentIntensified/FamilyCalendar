import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import EventFormModal from './EventFormModal.svelte';

describe('EventFormModal - Visible Fields (Create Mode)', () => {
	it('should show NL Input by default in create mode', () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }]
			}
		});

		// The NL input is shown as a paragraph, not placeholder
		expect(screen.getByText(/quick-add with natural language/i)).toBeInTheDocument();
		// Also check the input field exists
		expect(screen.getByPlaceholderText(/lunch friday/i)).toBeInTheDocument();
	});

	it('should show Title field by default', () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }]
			}
		});

		expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
	});

	it('should NOT show Description field by default in create mode (behind Show More)', () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }]
			}
		});

		// Description should be hidden by default (behind Show More)
		expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();
	});

	it('should show Description field after clicking Show More in create mode', async () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }]
			}
		});

		// Click Show More
		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		// Description should now be visible
		expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
	});

	it('should have a "Date" input after clicking Show More', async () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }]
			}
		});

		// Click Show More to reveal date field
		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const dateInput = screen.getByLabelText(/date/i);
		expect(dateInput).toBeInTheDocument();

		const startInput = screen.queryByLabelText(/^start$/i);
		expect(startInput).not.toBeInTheDocument();
	});
});

describe('EventFormModal - Multi-day Checkbox (Show More)', () => {
	it('should show multi-day checkbox after clicking Show More', async () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }]
			}
		});

		// Multi-day checkbox is behind Show More
		let multiDayCheckbox = screen.queryByLabelText(/multi-day/i);
		expect(multiDayCheckbox).not.toBeInTheDocument();

		// Click Show More
		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		multiDayCheckbox = screen.getByLabelText(/multi-day/i);
		expect(multiDayCheckbox).toBeInTheDocument();
		expect(multiDayCheckbox).not.toBeChecked();
	});

	it('should reveal end date input when multi-day is checked', async () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }]
			}
		});

		// Click Show More
		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		let endDateInput = screen.queryByLabelText(/end date/i);
		expect(endDateInput).not.toBeInTheDocument();

		const multiDayCheckbox = screen.getByLabelText(/multi-day/i);
		await fireEvent.click(multiDayCheckbox);

		endDateInput = screen.getByLabelText(/end date/i);
		expect(endDateInput).toBeInTheDocument();
	});
});

describe('EventFormModal - All-Day Default (Show More)', () => {
	it('should have all-day checkbox checked by default after clicking Show More', async () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }]
			}
		});

		// All-day checkbox is behind Show More
		let allDayCheckbox = screen.queryByLabelText(/all-day/i);
		expect(allDayCheckbox).not.toBeInTheDocument();

		// Click Show More
		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		allDayCheckbox = screen.getByLabelText(/all-day/i) as HTMLInputElement;
		expect(allDayCheckbox.checked).toBe(true); // DEFAULT CHECKED
	});

	it('should hide time inputs when all-day is checked', async () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }]
			}
		});

		// Click Show More
		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const startTimeInput = screen.queryByLabelText(/start time/i);
		expect(startTimeInput).not.toBeInTheDocument();

		const endTimeInput = screen.queryByLabelText(/end time/i);
		expect(endTimeInput).not.toBeInTheDocument();
	});

	it('should have start and end time on the same line (grid cols)', async () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }]
			}
		});

		// Click Show More
		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		// Uncheck all-day to show time inputs
		const allDayCheckbox = screen.getByLabelText(/all-day/i) as HTMLInputElement;
		await fireEvent.click(allDayCheckbox);

		// Check that start and end time are in the same grid
		const timeGrid = screen.getByLabelText(/start time/i).closest('.grid');
		expect(timeGrid).toHaveClass('grid-cols-2');
		expect(screen.getByLabelText(/end time/i)).toBeInTheDocument();
	});

	it('should have start and end date on the same line when multi-day', async () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }]
			}
		});

		// Click Show More
		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		// Checkin multi-day
		const multiDayCheckbox = screen.getByLabelText(/multi-day/i);
		await fireEvent.click(multiDayCheckbox);

		// Check that start date and end date are in the same grid
		const dateGrid = screen.getByLabelText(/end date/i).closest('.grid');
		expect(dateGrid).toHaveClass('grid-cols-2');
	});
});
