import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventFormModal from './EventFormModal.svelte';

const createMockLocalStorage = () => ({
	getItem: vi.fn(() => null),
	setItem: vi.fn()
});

describe('EventFormModal - NLP Field Detection & Visibility', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', vi.fn());
		vi.stubGlobal('localStorage', createMockLocalStorage());
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		cleanup();
	});

	it('should show date field inline when NLP detects it, without clicking Show More', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({
				parsed: { title: 'Team Meeting', date: '2026-05-05', startTime: '14:00' },
				confidence: 0.85
			})
		} as Response);

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'Team Meeting next Tuesday at 2pm' } });
		await vi.advanceTimersByTimeAsync(350);

		expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
	});

	it('should debounce NLP parse at 300ms', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({
				parsed: { title: 'Meeting', date: '2026-05-05' },
				confidence: 0.85
			})
		} as Response);

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'Meeting Tuesday' } });

		expect(fetch).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(299);
		expect(fetch).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('should show green checkmark on detected field labels', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({
				parsed: { title: 'Lunch', date: '2026-05-05', startTime: '12:00' },
				confidence: 0.85
			})
		} as Response);

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'Lunch at Cafe next Tuesday' } });
		await vi.advanceTimersByTimeAsync(350);

		const label = screen.getByText(/Start Date/i);
		const container = label.parentElement;
		expect(container?.textContent).toContain('✓');
	});

	it('should hide NLP-detected fields when Quick Add changes, unless user-touched', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ parsed: { title: 'Meeting', date: '2026-05-05', location: 'Office', startTime: '10:00' }, confidence: 0.85 })
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ parsed: { title: 'Dinner', date: '2026-05-06' }, confidence: 0.85 })
			} as Response);

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'Meeting at Office next Tuesday' } });
		await vi.advanceTimersByTimeAsync(350);

		expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();

		await fireEvent.input(nlInput, { target: { value: 'Dinner Wednesday' } });
		await vi.advanceTimersByTimeAsync(350);

		expect(screen.queryByLabelText(/location/i)).not.toBeInTheDocument();
	});

	it('should show start and end time inputs when NLP detects times', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({
				parsed: { title: 'Workshop', date: '2026-05-05', startTime: '09:00', endTime: '17:00' },
				confidence: 0.85
			})
		} as Response);

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'Workshop from 9am to 5pm Tuesday' } });
		await vi.advanceTimersByTimeAsync(350);

		const startTimeInput = document.getElementById('start-time') as HTMLInputElement;
		const endTimeInput = document.getElementById('end-time') as HTMLInputElement;
		expect(startTimeInput).toBeInTheDocument();
		expect(endTimeInput).toBeInTheDocument();
	});
});

describe('EventFormModal - Date & Time Layout', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createMockLocalStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('should show start date full width when multi-day is unchecked', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		const startDateInput = screen.getByLabelText(/start date/i);
		const dateGrid = startDateInput.closest('.grid');
		expect(dateGrid?.classList.contains('grid-cols-2')).toBe(false);
	});

	it('should show start and end dates side by side when multi-day is checked', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		const multiDayLabel = screen.getByText(/Multi-day/i).closest('label');
		const multiDayCheckbox = multiDayLabel?.querySelector('input[type="checkbox"]');
		await fireEvent.click(multiDayCheckbox!);

		const endDateInput = screen.getByLabelText(/end date/i);
		const dateGrid = endDateInput.closest('.grid');
		expect(dateGrid).toHaveClass('grid-cols-2');
	});

	it('should show start and end time on same line when all-day is unchecked', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		const allDayLabel = screen.getByText(/All day event/i).closest('label');
		const allDayInput = allDayLabel?.querySelector('input[type="checkbox"]');
		await fireEvent.click(allDayInput!);

		const startTimeInput = document.getElementById('start-time');
		const endTimeInput = document.getElementById('end-time');
		expect(startTimeInput).toBeInTheDocument();
		expect(endTimeInput).toBeInTheDocument();

		const timeGrid = startTimeInput?.closest('.grid');
		expect(timeGrid).toHaveClass('grid-cols-2');
	});

	it('should hide time inputs when all-day is checked', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		expect(document.getElementById('start-time')).not.toBeInTheDocument();
		expect(document.getElementById('end-time')).not.toBeInTheDocument();
	});
});

describe('EventFormModal - Description Field', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createMockLocalStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('should show Description textarea after clicking Show More', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
		const descEl = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
		expect(descEl.tagName).toBe('TEXTAREA');
	});

	it('should allow typing in description field', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		const descEl = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
		await fireEvent.input(descEl, { target: { value: 'Test description' } });
		expect(descEl.value).toBe('Test description');
	});
});

describe('EventFormModal - Contact Selector (PFP Style)', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createMockLocalStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('should show family member cards with circular avatars', async () => {
		const familyMembers = [
			{ userId: 'u1', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' },
			{ userId: 'u2', firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com' }
		];

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }], familyMembers }
		});

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		expect(screen.getByText(/Attendees/i)).toBeInTheDocument();
		expect(screen.getByText('Alice Smith')).toBeInTheDocument();
		expect(screen.getByText('bob@example.com')).toBeInTheDocument();

		const avatars = document.querySelectorAll('.rounded-full');
		expect(avatars.length).toBeGreaterThan(0);
	});

	it('should show first letter circle with colored background for non-family attendants', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		const manualInput = screen.getByPlaceholderText(/Search family/i);
		await fireEvent.input(manualInput, { target: { value: 'Grandma Rose' } });

		const addBtn = screen.getByText(/Add "Grandma Rose"/i);
		await fireEvent.click(addBtn);

		const initials = screen.queryByText('G');
		expect(initials).toBeInTheDocument();
	});

	it('should allow selecting family members with visual feedback', async () => {
		const familyMembers = [
			{ userId: 'u1', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' }
		];

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }], familyMembers }
		});

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		const aliceCard = screen.getAllByText('Alice Smith')[0].closest('button');
		await fireEvent.click(aliceCard!);

		await waitFor(() => {
			const removeBtns = screen.queryAllByRole('button', { name: /Remove u1/i });
			expect(removeBtns.length).toBeGreaterThan(0);
		});
	});

	it('should deduplicate family members by userId', async () => {
		const familyMembers = [
			{ userId: 'u1', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' },
			{ userId: 'u1', firstName: 'Alice', lastName: 'Smith', email: 'alice2@example.com' },
			{ userId: 'u2', firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com' }
		];

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }], familyMembers }
		});

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		const aliceCards = screen.queryAllByText('Alice Smith');
		expect(aliceCards).toHaveLength(1);
	});

	it('should show recent attendants from localStorage', async () => {
		const storageMock = vi.fn((key) => {
			if (key === 'recent_attendants') return JSON.stringify(['Grandma', 'Uncle Joe']);
			return null;
		});
		vi.stubGlobal('localStorage', { getItem: storageMock, setItem: vi.fn() });

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		await waitFor(() => {
			expect(screen.getByText('Grandma')).toBeInTheDocument();
			expect(screen.getByText('Uncle Joe')).toBeInTheDocument();
		});
	});
});

describe('EventFormModal - Visible Fields (Create Mode)', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createMockLocalStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('should show NL Input by default in create mode', () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		expect(screen.getByText(/type naturally/i)).toBeInTheDocument();
		expect(screen.getByPlaceholderText(/lunch friday/i)).toBeInTheDocument();
	});

	it('should show Title field by default', () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
	});

	it('should have a "Start Date" input after clicking Show More', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		const dateInput = screen.getByLabelText(/start date/i);
		expect(dateInput).toBeInTheDocument();
	});
});

describe('EventFormModal - All-Day & Multi-day Checkboxes', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createMockLocalStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('should show multi-day checkbox after clicking Show More', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		expect(screen.queryByText(/Multi-day/i)).not.toBeInTheDocument();

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		const multiDayCheckbox = screen.getByText(/Multi-day/i);
		expect(multiDayCheckbox).toBeInTheDocument();
		const checkbox = multiDayCheckbox.closest('label')?.querySelector('input[type="checkbox"]');
		expect(checkbox).not.toBeChecked();
	});

	it('should have all-day checkbox checked by default after clicking Show More', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		expect(screen.queryByText(/All day event/i)).not.toBeInTheDocument();

		const showMoreBtn = screen.getAllByRole('button', { name: /show more/i })[0];
		await fireEvent.click(showMoreBtn);

		const allDayLabel = screen.getByText(/All day event/i).closest('label');
		const allDayInput = allDayLabel?.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(allDayInput.checked).toBe(true);
	});
});
