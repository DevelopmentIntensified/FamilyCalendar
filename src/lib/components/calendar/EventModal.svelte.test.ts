import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invalidateAll } from '$app/navigation';
import type { Event } from '$lib/types';
import EventModal from './EventModal.svelte';

vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(() => Promise.resolve()),
	goto: vi.fn()
}));

const baseEvent: Event = {
	id: 'evt1',
	title: 'Test Event',
	start: '2026-07-17T10:00:00Z',
	end: '2026-07-17T11:00:00Z',
	allDay: false,
	location: 'Conference Room A',
	description: 'Team standup meeting',
	calendarId: 'cal1',
	ownerId: 'user1',
	created_at: new Date('2026-07-01T00:00:00Z'),
	recurrenceFrequency: null,
	recurrenceInterval: null
} as unknown as Event;

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
		const attendees = [
			{ userId: 'u1', status: 'maybe', firstName: 'Charlie', lastName: 'Brown' }
		];

		render(EventModal, {
			props: { show: true, event: baseEvent, attendees }
		});

		expect(screen.getByText(/Maybe.*1/)).toBeInTheDocument();
		expect(screen.getByText(/Charlie/)).toBeInTheDocument();
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
		expect(await screen.findByRole('button', { name: /Going/ })).toHaveAttribute('aria-pressed', 'true');
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
});
