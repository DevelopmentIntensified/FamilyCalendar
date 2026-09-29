import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import DayActionSheet from './DayActionSheet.svelte';
import type { Event } from '$lib/types';

// SAFETY: fixture covers the Event fields DayActionSheet renders.
const evt = (over: Partial<Event> = {}): Event =>
	({
		id: 'e1',
		ownerId: 'u1',
		calendarId: 'cal1',
		title: 'Standup',
		date: '2026-09-08',
		start: '2026-09-08T10:00:00',
		end: '2026-09-08T11:00:00',
		description: null,
		location: null,
		allDay: false,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		color: '#0ea5e9',
		created_at: new Date('2026-01-01T00:00:00Z'),
		...over
	}) as Event;

function renderSheet(events: Event[]) {
	return render(DayActionSheet, {
		props: {
			open: true,
			date: DateTime.fromISO('2026-09-08T12:00:00'),
			events,
			onClose: vi.fn(),
			onEventClick: vi.fn()
		}
	});
}

const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);

afterEach(cleanup);

// #067 — the sheet is a WORD view (full-width rows in a max-w-md sheet), so an
// ad must say so in plain sight. The word was only rendered on the allDay
// branch, so a TIMED ad fell through to a bare bag glyph.
describe('DayActionSheet names a sponsored event', () => {
	it('shows the word for a TIMED ad', () => {
		renderSheet([evt({ id: 'ad', title: 'Toy drive', isAd: true })]);
		expect(mark('sponsored')?.querySelector('[data-chip-word]')?.textContent).toBe('Ad');
	});

	it('shows the word for an all-day ad, outranking the all-day word', () => {
		renderSheet([evt({ id: 'ad', title: 'Toy drive', isAd: true, allDay: true })]);
		expect(mark('sponsored')?.querySelector('[data-chip-word]')?.textContent).toBe('Ad');
		expect(mark('allDay')).toBeNull();
	});

	it('keeps the hatch neutral', () => {
		renderSheet([evt({ id: 'ad', title: 'Toy drive', isAd: true })]);
		const chip = screen.getByText('Toy drive').closest('button');
		expect(chip?.getAttribute('style')).toContain('repeating-linear-gradient');
		expect(chip?.className).not.toMatch(/amber/);
	});

	it('still says "All day" for a plain all-day event', () => {
		renderSheet([evt({ id: 'a', title: 'Holiday', allDay: true })]);
		expect(mark('allDay')?.querySelector('[data-chip-word]')?.textContent).toBe('All day');
		expect(screen.queryByText('Ad')).toBeNull();
	});

	it('leaves an ordinary timed event unnamed, and still shows its time', () => {
		renderSheet([evt({ title: 'Standup' })]);
		expect(mark('sponsored')).toBeNull();
		expect(screen.queryByText('Ad')).toBeNull();
		expect(screen.getByText(/10:00/)).toBeInTheDocument();
	});
});
