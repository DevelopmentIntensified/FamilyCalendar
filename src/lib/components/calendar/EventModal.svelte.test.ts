import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invalidateAll } from '$app/navigation';
import type { Event } from '$lib/types';
import EventModal from './EventModal.svelte';

// oxlint-disable-next-line anti-slop/no-module-mocking -- DI seam impossible: `$app/navigation` is a SvelteKit virtual module imported inside EventModal; there is no injectable surface short of changing the component's public API.
vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(() => Promise.resolve()),
	goto: vi.fn()
}));

const baseEvent: Event = {
	id: 'evt1',
	calendarId: 'cal1',
	ownerId: 'user1',
	title: 'Test Event',
	start: '2026-07-17T10:00:00Z',
	end: '2026-07-17T11:00:00Z',
	description: 'Team standup meeting',
	location: 'Conference Room A',
	allDay: false,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	reminderMinutes: null,
	created_at: new Date('2026-07-01T00:00:00Z')
};

describe('EventModal - display details', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('should show location when event has location', () => {
		render(EventModal, {
			props: { show: true, event: baseEvent }
		});

		expect(screen.getByText('Conference Room A')).toBeInTheDocument();
	});

	it('should show description when event has description', () => {
		render(EventModal, {
			props: { show: true, event: baseEvent }
		});

		expect(screen.getByText('Team standup meeting')).toBeInTheDocument();
	});

	it('should show attendees when passed with going status', () => {
		const attendees = [
			{ userId: 'u1', status: 'going', firstName: 'Alice', lastName: 'Smith' },
			{ userId: 'u2', status: 'going', firstName: 'Bob', lastName: 'Jones' }
		];

		render(EventModal, {
			props: { show: true, event: baseEvent, attendees }
		});

		expect(screen.getByText(/Going.*2/)).toBeInTheDocument();
		expect(screen.getByText(/Alice/)).toBeInTheDocument();
		expect(screen.getByText(/Bob/)).toBeInTheDocument();
	});

	it('should show non-user attendants when passed', () => {
		const nonUserAttendants = ['Grandma', 'Uncle Joe'];

		render(EventModal, {
			props: { show: true, event: baseEvent, nonUserAttendants }
		});

		expect(screen.getByText('Grandma')).toBeInTheDocument();
		expect(screen.getByText('Uncle Joe')).toBeInTheDocument();
	});

	it('should show calendar name when calendars prop provided', () => {
		const calendars = [
			{ id: 'cal1', name: 'Personal Calendar' },
			{ id: 'cal2', name: 'Family Calendar' }
		];

		render(EventModal, {
			props: { show: true, event: { ...baseEvent, calendarId: 'cal2' }, calendars }
		});

		expect(screen.getByText('Family Calendar')).toBeInTheDocument();
	});

	it('should show RSVP status badge when currentUserRsvpStatus is set', () => {
		render(EventModal, {
			props: { show: true, event: baseEvent, currentUserRsvpStatus: 'going' }
		});

		const goingBtn = screen.getByRole('button', { name: /^going$/i });
		expect(goingBtn.className).toContain('bg-green-600');
	});

	it('should show maybe attendees when passed', () => {
		const attendees = [{ userId: 'u1', status: 'maybe', firstName: 'Charlie', lastName: 'Brown' }];

		render(EventModal, {
			props: { show: true, event: baseEvent, attendees }
		});

		expect(screen.getByText(/Maybe.*1/)).toBeInTheDocument();
		expect(screen.getByText(/Charlie/)).toBeInTheDocument();
	});
});

/**
 * Issue 126: verifying the modal against app-ui/event.html. The prototype's
 * three attendance marks — the creator's name, an indication of your own RSVP,
 * and a "who's going" summary that leads with a proportion — are checked
 * together here rather than per component, because the claim is about what the
 * modal shows, not about which file renders it.
 */
describe('EventModal — against app-ui/event.html', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('names who created the event', () => {
		render(EventModal, {
			props: { show: true, event: { ...baseEvent, creatorName: 'Sarah' } }
		});

		expect(screen.getByText('Created by Sarah')).toBeInTheDocument();
	});

	it('omits the creator row on a personal event, which has nobody to credit', () => {
		render(EventModal, { props: { show: true, event: baseEvent } });

		expect(screen.queryByText(/Created by/)).not.toBeInTheDocument();
	});

	it('shows your own RSVP as a first-class action', () => {
		render(EventModal, {
			props: { show: true, event: baseEvent, currentUserRsvpStatus: 'maybe' }
		});

		expect(screen.getByRole('button', { name: /^going$/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /^maybe$/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /can't go/i })).toBeInTheDocument();
	});

	it('leads the attendance block with a proportion, not a bare total', () => {
		render(EventModal, {
			props: {
				show: true,
				event: baseEvent,
				attendees: [
					{ userId: 'u1', status: 'going', firstName: 'Alice', lastName: 'Smith' },
					{ userId: 'u2', status: 'going', firstName: 'Bob', lastName: 'Jones' },
					{ userId: 'u3', status: 'maybe', firstName: 'Cleo', lastName: 'Ray' }
				],
				nonUserAttendants: ['Ms Okafor']
			}
		});

		// 2 going of 4 asked — the guest counts, she was asked too.
		expect(screen.getByTestId('attendance-summary')).toHaveTextContent('2 of 4 going');
	});
});

describe('EventModal - onClose callback convention', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('notifies the parent via onClose on X so selection state can clear', async () => {
		const onClose = vi.fn();
		render(EventModal, {
			props: { show: true, event: baseEvent, onClose }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('notifies the parent via onClose on backdrop click too', async () => {
		const onClose = vi.fn();
		const { container } = render(EventModal, {
			props: { show: true, event: baseEvent, onClose }
		});
		// Backdrop is the absolute inset layer behind the panel.
		const backdrop = container.querySelector('.fixed .absolute.inset-0');
		expect(backdrop).not.toBeNull();
		await fireEvent.click(backdrop!);
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

describe('EventModal - RSVP refresh', () => {
	beforeEach(() => {
		vi.mocked(invalidateAll).mockClear();
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				if (init?.method === 'POST') {
					return {
						ok: true,
						json: async () => ({
							attendance: [{ userId: 'user1', status: 'going', firstName: 'T', lastName: 'U' }],
							rsvpStatus: 'going'
						})
					};
				}
				return { ok: true, json: async () => ({ attendance: [], userRsvpStatus: 'undecided' }) };
			})
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('refreshes all views after an RSVP change so chips update without reload', async () => {
		render(EventModal, { props: { show: true, event: baseEvent } });
		await fireEvent.click(screen.getByRole('button', { name: /Going/ }));
		expect(await screen.findByRole('button', { name: /Going/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});

	it('ignores a stale initial load that resolves after an RSVP change', async () => {
		let resolveGet: ((v: unknown) => void) | null = null;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				if (init?.method === 'POST') {
					return {
						ok: true,
						json: async () => ({
							attendance: [{ userId: 'user1', status: 'going' }],
							rsvpStatus: 'going'
						})
					};
				}
				return {
					ok: true,
					json: () =>
						new Promise((resolve) => {
							resolveGet = resolve as (v: unknown) => void;
						})
				};
			}
			)
		);
		render(EventModal, { props: { show: true, event: baseEvent } });
		await fireEvent.click(screen.getByRole('button', { name: /Going/ }));
		expect(await screen.findByRole('button', { name: /Going/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		// Stale GET finally resolves with the old undecided state.
		resolveGet!({ attendance: [], userRsvpStatus: 'undecided' });
		await new Promise((r) => setTimeout(r, 20));
		expect(screen.getByRole('button', { name: /Going/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	});
});

describe('EventModal - reminder display', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ attendance: [], userRsvpStatus: 'undecided' })
			}))
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('shows a human reminder label when the event has one', () => {
		render(EventModal, { props: { show: true, event: { ...baseEvent, reminderMinutes: 60 } } });
		expect(screen.getByText('Reminder: 1 hour before')).toBeInTheDocument();
	});

	it('hides the reminder row when the event has none', () => {
		render(EventModal, { props: { show: true, event: baseEvent } });
		expect(screen.queryByText(/reminder:/i)).not.toBeInTheDocument();
	});

	it('shows the export menu in the header for regular events', async () => {
		render(EventModal, { props: { show: true, event: baseEvent } });
		await fireEvent.click(screen.getByRole('button', { name: 'Export options' }));
		expect(screen.getByRole('menuitem', { name: 'Add to Google' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: 'Add to .ics' })).toBeInTheDocument();
	});

	it('hides the export menu for ads', () => {
		render(EventModal, { props: { show: true, event: { ...baseEvent, isAd: true } } });
		expect(screen.queryByRole('button', { name: 'Export options' })).not.toBeInTheDocument();
	});
});

describe('EventModal - confirm popovers', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ attendance: [], userRsvpStatus: 'undecided' })
			}))
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('pops the delete confirmation above the action bar, outside the scroll body', async () => {
		render(EventModal, { props: { show: true, event: baseEvent } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
		const prompt = screen.getByText('Delete this event?');
		expect(prompt).toBeInTheDocument();
		expect(prompt.closest('.overflow-y-auto')).toBeNull();
	});

	it('pops the duplicate confirmation above the action bar, outside the scroll body', async () => {
		render(EventModal, { props: { show: true, event: baseEvent } });
		await fireEvent.click(screen.getByRole('button', { name: 'Duplicate event' }));
		const prompt = screen.getByText('Duplicate this event?');
		expect(prompt).toBeInTheDocument();
		expect(prompt.closest('.overflow-y-auto')).toBeNull();
	});
});

// Issue 015: `performDelete` had no busy flag and the confirm bar never
// disabled, so a double tap fired two DELETEs and the second 404 vanished
// behind a modal that had already closed.
describe('EventModal - delete pending state', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	/** Attendance GET resolves; the DELETE hangs so the modal stays open. */
	function stubHangingDelete() {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				if (init?.method === 'DELETE') return new Promise(() => {});
				return { ok: true, json: async () => ({ attendance: [], userRsvpStatus: 'undecided' }) };
			})
		);
	}

	const deleteCalls = () => vi.mocked(fetch).mock.calls.filter(([, i]) => i?.method === 'DELETE');

	it('sends exactly one DELETE when Delete is double-tapped', async () => {
		stubHangingDelete();
		render(EventModal, { props: { show: true, event: baseEvent } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
		// SAFETY: the confirm popover's primary action is a <button>.
		const del = screen.getByRole('button', { name: /^Delete$/ }) as HTMLButtonElement;
		await fireEvent.click(del);
		await fireEvent.click(del);
		expect(deleteCalls()).toHaveLength(1);
	});

	it('disables the whole delete confirm bar while the request is in flight', async () => {
		stubHangingDelete();
		render(EventModal, { props: { show: true, event: baseEvent } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
		await fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
		// The label names the pending state, and nothing in the bar is live.
		for (const name of ['Deleting…', 'Cancel', 'Delete event']) {
			expect(screen.getByRole('button', { name })).toBeDisabled();
		}
	});

	it('sends exactly one DELETE when a series scope is double-tapped', async () => {
		stubHangingDelete();
		const recurring = { ...baseEvent, recurrenceFrequency: 'weekly', recurrenceInterval: 1 };
		render(EventModal, { props: { show: true, event: recurring } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
		const scope = screen.getByRole('button', { name: 'Whole series' }) as HTMLButtonElement;
		await fireEvent.click(scope);
		await fireEvent.click(scope);
		expect(deleteCalls()).toHaveLength(1);
		expect(screen.getByRole('button', { name: 'This occurrence' })).toBeDisabled();
	});
});

// Issue 015: the modal client-fetches attendees and checklist tasks, and
// rendered an empty region until they landed. A skeleton names the wait.
describe('EventModal - attendee/checklist loading state', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('shows a skeleton for attendees and the checklist, then swaps in the content', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Promise((resolve) =>
						setTimeout(
							() =>
								resolve({
									ok: true,
									json: async () => ({
										attendance: [{ userId: 'u1', status: 'going', firstName: 'Alice' }],
										userRsvpStatus: 'going',
										tasks: [{ id: 'k1', title: 'Bring plates', completedAt: null }]
									})
								}),
							0
						)
					)
			)
		);
		render(EventModal, { props: { show: true, event: baseEvent } });
		expect(screen.getByTestId('attendee-skeleton')).toBeInTheDocument();
		expect(screen.getByTestId('checklist-skeleton')).toBeInTheDocument();

		expect(await screen.findByText('Bring plates')).toBeInTheDocument();
		// The two loads are independent, so wait each skeleton out in turn.
		await waitFor(() => expect(screen.queryByTestId('checklist-skeleton')).toBeNull());
		await waitFor(() => expect(screen.queryByTestId('attendee-skeleton')).toBeNull());
		expect(screen.getByText('Alice')).toBeInTheDocument();
	});

	it('never covers attendees the server already passed in', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Promise(() => {})));
		render(EventModal, {
			props: {
				show: true,
				event: baseEvent,
				attendees: [{ userId: 'u1', status: 'going', firstName: 'Alice' }]
			}
		});
		await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
		expect(screen.queryByTestId('attendee-skeleton')).toBeNull();
	});
});

describe('EventModal - duplicate payload', () => {	const dupEvent: Event = {
		...baseEvent,
		recurrenceFrequency: 'weekly',
		recurrenceInterval: 1,
		recurrenceByDay: ['MO', 'WE'],
		recurrenceCount: 5,
		recurrenceUntil: '2026-12-31T00:00:00.000Z',
		reminderMinutes: 60
	};

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('sends reminderMinutes + attendee rows in the duplicate POST', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				if (init?.method === 'POST') {
					return { ok: true, json: async () => ({ event: { id: 'copy1' } }) };
				}
				return {
					ok: true,
					json: async () => ({
						attendance: [
							{ userId: 'u1', status: 'going', firstName: 'Alice', inviteType: 'required' },
							{ userId: null, name: 'Grandma Rose', status: 'undecided', inviteType: 'optional' }
						],
						userRsvpStatus: 'going'
					})
				};
			})
		);

		render(EventModal, { props: { show: true, event: dupEvent } });
		await fireEvent.click(screen.getByRole('button', { name: 'Duplicate event' }));
		await fireEvent.click(screen.getByRole('button', { name: /^Duplicate$/ }));
		await waitFor(() => {
			const post = vi
				.mocked(fetch)
				.mock.calls.find(([u, init]) => String(u) === '/api/events' && init?.method === 'POST');
			expect(post).toBeDefined();
		});
		const post = vi
			.mocked(fetch)
			.mock.calls.find(([u, init]) => String(u) === '/api/events' && init?.method === 'POST');
		const body = JSON.parse(String(post?.[1]?.body));
		expect(body.reminderMinutes).toBe(60);
		expect(body.recurrenceByDay).toEqual(['MO', 'WE']);
		expect(body.attendees).toEqual([
			{ value: 'u1', isUser: true, inviteType: 'required' },
			{ value: 'Grandma Rose', isUser: false, inviteType: 'optional' }
		]);
	});
});
