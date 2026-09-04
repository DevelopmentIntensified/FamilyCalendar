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

	it('should preselect the calendar named by quick-add ("on the family calendar")', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					parsed: { title: 'Dinner', date: '2026-09-04', calendarName: 'family calendar' },
					confidence: 0.85
				})
		} as Response);

		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [
					{ id: 'work', name: 'Work Calendar' },
					{ id: 'fam', name: 'Family Calendar' }
				]
			}
		});

		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'Dinner Friday on the family calendar' } });
		await vi.advanceTimersByTimeAsync(350);

		expect(screen.getAllByText('Family Calendar').length).toBeGreaterThan(0);
	});

	it('should keep the default calendar when quick-add names no match', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					parsed: { title: 'Dinner', date: '2026-09-04', calendarName: 'sports calendar' },
					confidence: 0.85
				})
		} as Response);

		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [
					{ id: 'work', name: 'Work Calendar' },
					{ id: 'fam', name: 'Family Calendar' }
				]
			}
		});

		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'Dinner Friday on the sports calendar' } });
		await vi.advanceTimersByTimeAsync(350);

		expect(screen.queryByText('Family Calendar')).not.toBeInTheDocument();
	});

	it('should POST once per parsed date and show the multi-date hint', async () => {
		vi.mocked(fetch).mockImplementation(async (url: any) => {
			if (String(url).includes('/api/parse-event')) {
				return {
					ok: true,
					json: () =>
						Promise.resolve({
							parsed: {
								title: 'Launch',
								date: '2026-09-23',
								dates: ['2026-09-23', '2026-09-30']
							},
							confidence: 0.9
						})
				};
			}
			return { ok: true, json: () => Promise.resolve({ event: { id: 'e1' } }) };
		}) as any;

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'launch sept 23 & 30' } });
		await vi.advanceTimersByTimeAsync(350);

		expect(screen.getByText(/creates 2 events/i)).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Create' }));
		await vi.advanceTimersByTimeAsync(50);

		const posts = vi
			.mocked(fetch)
			.mock.calls.filter(([u]) => String(u) === '/api/events');
		expect(posts).toHaveLength(2);
		const secondBody = JSON.parse(String(posts[1][1]?.body ?? posts[1][1]));
		expect(secondBody.start).toContain('2026-09-30');
	});

	it('should create all events from a multi-event parse', async () => {
		vi.mocked(fetch).mockImplementation(async (url: any) => {
			if (String(url).includes('/api/parse-event')) {
				return {
					ok: true,
					json: () =>
						Promise.resolve({
							results: [
								{ parsed: { title: 'Dinner', date: '2026-09-04' }, confidence: 0.8 },
								{ parsed: { title: 'Movie', date: '2026-09-05' }, confidence: 0.8 }
							],
							method: 'regex-list'
						})
				};
			}
			return { ok: true, json: () => Promise.resolve({ event: { id: 'e1' } }) };
		}) as any;

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'dinner Friday and movie Saturday' } });
		await vi.advanceTimersByTimeAsync(350);

		expect(screen.getByText(/2 events detected/i)).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /create 2 events/i }));
		await vi.advanceTimersByTimeAsync(50);

		const posts = vi.mocked(fetch).mock.calls.filter(([u]) => String(u) === '/api/events');
		expect(posts).toHaveLength(2);
	});

	it('should report every parsed result, not just the first', async () => {
		vi.mocked(fetch).mockImplementation(async (url: any, init?: any) => {
			if (String(url).includes('/api/parse-event')) {
				return {
					ok: true,
					json: () =>
						Promise.resolve({
							results: [
								{ parsed: { title: 'Dinner', date: '2026-09-04' }, confidence: 0.8 },
								{ parsed: { title: 'Movie', date: '2026-09-05' }, confidence: 0.8 }
							],
							method: 'regex-list'
						})
				};
			}
			return { ok: true, json: () => Promise.resolve({}) };
		}) as any;

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'dinner Friday and movie Saturday' } });
		await vi.advanceTimersByTimeAsync(350);

		await fireEvent.click(screen.getByRole('button', { name: /parsed wrong/i }));
		await vi.advanceTimersByTimeAsync(50);

		const reports = vi.mocked(fetch).mock.calls.filter(([u]) => String(u) === '/api/report-phrase');
		expect(reports).toHaveLength(1);
		const body = JSON.parse(String((reports[0][1] as any)?.body ?? '{}'));
		expect(body.matched.results).toHaveLength(2);
		expect(body.matched.results[1]).toMatchObject({ title: 'Movie' });
	});

	it('should reflect quick-add reminder minutes in the reminder picker', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					parsed: { title: 'Dentist', date: '2026-09-07', reminderMinutes: 30 },
					confidence: 0.85
				})
		} as Response);

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'dentist tomorrow remind me 30 min before' } });
		await vi.advanceTimersByTimeAsync(350);

		await fireEvent.click(screen.getByRole('button', { name: /show more/i }));
		const select = screen.getByLabelText(/reminder/i) as HTMLSelectElement;
		expect(select.value).toBe('30');
	});

	it('should seed start and end times from a picked range', async () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }],
				initialDate: '2026-09-08',
				initialTime: '14:00',
				initialEndTime: '15:30'
			}
		});

		expect((document.getElementById('start-time') as HTMLInputElement).value).toBe('14:00');
		expect((document.getElementById('end-time') as HTMLInputElement).value).toBe('15:30');
	});

	it('should show date and time fields immediately for a picked range', async () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }],
				initialDate: '2026-09-08',
				initialTime: '14:00',
				initialEndTime: '15:30'
			}
		});

		expect(document.getElementById('start-time')).toBeInTheDocument();
		expect(document.getElementById('end-time')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
	});

	it('should not let quick-add times clobber a picked range', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					parsed: { title: 'Dentist', date: '2026-09-09', startTime: '18:00' },
					confidence: 0.85
				})
		} as Response);

		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [{ id: 'cal1', name: 'My Calendar' }],
				initialDate: '2026-09-08',
				initialTime: '14:00',
				initialEndTime: '15:30'
			}
		});

		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'dentist at 6pm' } });
		await vi.advanceTimersByTimeAsync(350);

		expect((document.getElementById('start-time') as HTMLInputElement).value).toBe('14:00');
	});

	it('should default creation to the personal calendar', async () => {
		render(EventFormModal, {
			props: {
				show: true,
				calendarIds: [
					{ id: 'pers', name: 'Personal Calendar' },
					{ id: 'fam', name: 'Family Calendar' }
				],
				defaultCalendarId: 'pers',
				initialDate: '2026-09-08'
			}
		});

		expect(screen.getByText('Personal Calendar')).toBeInTheDocument();
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

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const startDateInput = screen.getByLabelText(/start date/i);
		const dateContainer = startDateInput.parentElement?.parentElement;
		expect(dateContainer?.classList.contains('grid-cols-2')).toBe(false);
	});

	it('should show start and end dates side by side when multi-day is checked', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const multiDayBtn = screen.getByRole('button', { name: /Multi-day/i });
		await fireEvent.click(multiDayBtn);

		const endDateInput = screen.getByLabelText(/end date/i);
		const dateGrid = endDateInput.closest('.grid');
		expect(dateGrid).toHaveClass('grid-cols-2');
	});

	it('should show start and end time on same line when all-day is unchecked', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

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

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const allDayBtn = screen.getByRole('button', { name: /All day/i });
		await fireEvent.click(allDayBtn);

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

	it('should show Description textarea by default', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
		const descEl = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
		expect(descEl.tagName).toBe('TEXTAREA');
	});

	it('should allow typing in description field', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const descEl = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
		await fireEvent.input(descEl, { target: { value: 'Test description' } });
		expect(descEl.value).toBe('Test description');
	});
});

describe('EventFormModal - Attendants Selector', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createMockLocalStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('should show attendees label after clicking Show More', async () => {
		const familyMembers = [
			{ userId: 'u1', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' }
		];

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }], familyMembers }
		});

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		expect(screen.getByText(/Attendees/i)).toBeInTheDocument();
	});

	it('should show search input for attendants', async () => {
		const familyMembers = [
			{ userId: 'u1', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' }
		];

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }], familyMembers }
		});

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const searchInput = screen.getByPlaceholderText(/Search family/i);
		expect(searchInput).toBeInTheDocument();
	});

	it('should add custom attendant when no matches found', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const searchInput = screen.getByPlaceholderText(/Search family/i);
		await fireEvent.focus(searchInput);
		await fireEvent.input(searchInput, { target: { value: 'Grandma Rose' } });

		const addBtn = screen.getByText(/Add "Grandma Rose"/i);
		await fireEvent.click(addBtn);

		expect(screen.queryByText('Grandma Rose')).toBeInTheDocument();
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

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const searchInput = screen.getByPlaceholderText(/Search family/i);
		await fireEvent.focus(searchInput);

		const aliceCards = screen.queryAllByText('Alice Smith');
		expect(aliceCards.length).toBe(1);
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

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const searchInput = screen.getByPlaceholderText(/Search family/i);
		await fireEvent.focus(searchInput);

		await waitFor(() => {
			expect(screen.getByText('Grandma')).toBeInTheDocument();
			expect(screen.getByText('Uncle Joe')).toBeInTheDocument();
		});
	});

	it('should display selected attendant chips with initials', async () => {
		const familyMembers = [
			{ userId: 'u1', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' }
		];

		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }], familyMembers }
		});

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const searchInput = screen.getByPlaceholderText(/Search family/i);
		await fireEvent.focus(searchInput);

		const aliceBtn = screen.getByText('Alice Smith').closest('button');
		await fireEvent.click(aliceBtn!);

		await waitFor(() => {
			expect(screen.getByText('Alice Smith')).toBeInTheDocument();
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

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const dateInput = screen.getByLabelText(/start date/i);
		expect(dateInput).toBeInTheDocument();
	});
});

describe('EventFormModal - All-Day & Multi-day Toggles', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createMockLocalStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('should show multi-day toggle after clicking Show More', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		expect(screen.queryByText(/Multi-day/i)).not.toBeInTheDocument();

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const multiDayBtn = screen.getByRole('button', { name: /Multi-day/i });
		expect(multiDayBtn).toBeInTheDocument();
		expect(multiDayBtn.classList.contains('bg-primary-50')).toBe(false);
	});

	it('should have all-day toggle off by default after clicking Show More', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const allDayBtn = screen.getByRole('button', { name: /All day/i });
		const toggleDiv = allDayBtn.querySelector('div');
		expect(toggleDiv?.classList.contains('bg-slate-300')).toBe(true);
	});
});

describe('EventFormModal - Calendar Selector', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createMockLocalStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('should not show calendar selector with only one calendar', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }] }
		});

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		expect(screen.queryByText('Calendar')).not.toBeInTheDocument();
	});

	it('should show calendar selector when user has 2+ calendars after Show More', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [
				{ id: 'cal1', name: 'Personal' },
				{ id: 'cal2', name: 'Family' }
			]}
		});

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const calendarLabel = screen.getByText('Calendar');
		expect(calendarLabel).toBeInTheDocument();
		const calendarContainer = calendarLabel.parentElement;
		expect(calendarContainer?.querySelector('button')).toBeInTheDocument();
	});

	it('should show calendar selector by default in edit mode', async () => {
		const mockEvent = {
			id: 'evt1',
			title: 'Meeting',
			start: '2024-05-03T10:00:00Z',
			end: '2024-05-03T11:00:00Z',
			allDay: false,
			calendarId: 'cal2',
			description: '',
			location: ''
		} as any;

		render(EventFormModal, {
			props: { show: true, event: mockEvent, calendarIds: [
				{ id: 'cal1', name: 'Personal' },
				{ id: 'cal2', name: 'Family' }
			]}
		});

		const calendarLabel = screen.getByText('Calendar');
		expect(calendarLabel).toBeInTheDocument();
		const calendarContainer = calendarLabel.parentElement;
		expect(calendarContainer?.querySelector('button')).toBeInTheDocument();
	});

	it('should allow selecting a different calendar', async () => {
		render(EventFormModal, {
			props: { show: true, calendarIds: [
				{ id: 'cal1', name: 'Personal' },
				{ id: 'cal2', name: 'Family' }
			]}
		});

		const showMoreBtn = screen.getByRole('button', { name: /show more/i });
		await fireEvent.click(showMoreBtn);

		const calendarLabel = screen.getByText('Calendar');
		const calendarContainer = calendarLabel.parentElement;
		const calendarBtn = calendarContainer?.querySelector('button');
		await fireEvent.click(calendarBtn!);

		const familyOption = screen.getByText('Family');
		await fireEvent.click(familyOption);

		await waitFor(() => {
			expect(calendarBtn?.textContent).toContain('Family');
		});
	});
});

describe('EventFormModal - onClose callback convention', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
		vi.stubGlobal('localStorage', createMockLocalStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('notifies the parent via onClose on X so selection state can clear', async () => {
		const onClose = vi.fn();
		render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }], onClose }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('notifies the parent via onClose on backdrop click too', async () => {
		const onClose = vi.fn();
		const { container } = render(EventFormModal, {
			props: { show: true, calendarIds: [{ id: 'cal1', name: 'My Calendar' }], onClose }
		});
		// Backdrop is the fixed inset layer behind the panel.
		const backdrop = container.querySelector('.fixed.inset-0');
		expect(backdrop).not.toBeNull();
		await fireEvent.click(backdrop!);
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
