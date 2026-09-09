import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Event } from '$lib/types';
import EventModalHeader from './EventModalHeader.svelte';

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

describe('EventModalHeader', () => {
	it('renders the title and close button', async () => {
		const onClose = vi.fn();
		render(EventModalHeader, { props: { event: baseEvent, onClose } });
		expect(screen.getByRole('heading', { name: 'Test Event' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('labels daily / interval / monthly recurrence like the old inline block', () => {
		const { unmount } = render(EventModalHeader, {
			props: {
				event: { ...baseEvent, recurrenceFrequency: 'daily', recurrenceInterval: 1 },
				onClose: vi.fn()
			}
		});
		expect(screen.getByText(/Repeats daily/)).toBeInTheDocument();
		unmount();

		render(EventModalHeader, {
			props: {
				event: { ...baseEvent, recurrenceFrequency: 'weekly', recurrenceInterval: 2 },
				onClose: vi.fn()
			}
		});
		expect(screen.getByText(/Repeats every 2 weeks/)).toBeInTheDocument();
	});

	it('shows the export menu, hidden for ads', () => {
		const { unmount } = render(EventModalHeader, {
			props: { event: baseEvent, onClose: vi.fn() }
		});
		expect(screen.getByRole('button', { name: 'Export options' })).toBeInTheDocument();
		unmount();
		render(EventModalHeader, {
			props: { event: { ...baseEvent, isAd: true }, onClose: vi.fn() }
		});
		expect(screen.queryByRole('button', { name: 'Export options' })).not.toBeInTheDocument();
	});
});
