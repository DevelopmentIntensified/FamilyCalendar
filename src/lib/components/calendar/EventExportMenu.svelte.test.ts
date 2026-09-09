import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import type { Event } from '$lib/types';
import EventExportMenu from './EventExportMenu.svelte';

const baseEvent: Event = {
	id: 'evt1',
	calendarId: 'cal1',
	ownerId: 'user1',
	title: 'Test Event',
	start: '2026-07-17T10:00:00Z',
	end: '2026-07-17T11:00:00Z',
	description: null,
	location: null,
	allDay: false,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	reminderMinutes: null,
	created_at: new Date('2026-07-01T00:00:00Z')
};

afterEach(cleanup);

describe('EventExportMenu', () => {
	it('renders a closed three-dot button with no menu items', () => {
		render(EventExportMenu, { props: { event: baseEvent } });
		expect(screen.getByRole('button', { name: 'Export options' })).toBeInTheDocument();
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});

	it('opens the menu with Google + .ics links on click', async () => {
		render(EventExportMenu, { props: { event: baseEvent } });
		await fireEvent.click(screen.getByRole('button', { name: 'Export options' }));
		expect(screen.getByRole('menu')).toBeInTheDocument();
		const google = screen.getByRole('menuitem', { name: 'Add to Google' });
		expect(google.getAttribute('href')).toContain('calendar.google.com');
		const ics = screen.getByRole('menuitem', { name: 'Add to .ics' });
		expect(ics.getAttribute('href')).toBe('/api/events/evt1/ics');
	});

	it('closes the menu on Escape', async () => {
		render(EventExportMenu, { props: { event: baseEvent } });
		await fireEvent.click(screen.getByRole('button', { name: 'Export options' }));
		expect(screen.getByRole('menu')).toBeInTheDocument();
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});
});
