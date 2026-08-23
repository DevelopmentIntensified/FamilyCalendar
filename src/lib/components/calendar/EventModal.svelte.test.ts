import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Event } from '$lib/types';
import EventModal from './EventModal.svelte';

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
