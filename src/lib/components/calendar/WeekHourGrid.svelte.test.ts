import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import { writable } from 'svelte/store';
import WeekHourGrid from './WeekHourGrid.svelte';
import type { Event } from '$lib/types';

const MONDAY = DateTime.fromISO('2026-09-07T12:00:00');
const weekDays = Array.from({ length: 7 }, (_, i) => MONDAY.plus({ days: i }));

function props(overrides = {}) {
	return {
		weekDays,
		hours: Array.from({ length: 24 }, (_, i) => i),
		currentDate: writable(MONDAY),
		moveError: '',
		isCurrentHour: () => false,
		eventsForDay: () => [],
		selecting: null,
		rangeSel: null,
		addMode: false,
		selectionMode: false,
		isSelected: () => false,
		calendarIds: [{ id: 'cal1', name: 'My Calendar' }],
		totalWeekItems: 1,
		rangeTouchAction: () => ({ update: () => {}, destroy: () => {} }),
		onColumnDrop: vi.fn(),
		onColumnClick: vi.fn(),
		onRangeMouseDown: vi.fn(),
		onRangeMouseMove: vi.fn(),
		onRangeMouseUp: vi.fn(),
		onStepRangeEnd: vi.fn(),
		onCreateRange: vi.fn(),
		onDismissRange: vi.fn(),
		onEventClick: vi.fn(),
		onDragStart: vi.fn(),
		...overrides
	};
}

describe('WeekHourGrid', () => {
	afterEach(cleanup);

	it('renders seven day columns and hour labels', () => {
		render(WeekHourGrid, { props: props() });
		expect(document.querySelectorAll('[data-testid="week-day-column"]')).toHaveLength(7);
		expect(screen.getByText('12 AM')).toBeInTheDocument();
		expect(screen.getByText('12 PM')).toBeInTheDocument();
	});

	it('shows the empty-week hint and surfaces move errors', () => {
		render(WeekHourGrid, { props: props({ totalWeekItems: 0, moveError: 'Nope' }) });
		expect(screen.getByText(/blank week is full of options/)).toBeInTheDocument();
		expect(screen.getByRole('alert')).toHaveTextContent('Nope');
	});
});

// SAFETY: fixture covers the Event fields WeekHourGrid renders.
const evt = {
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
	created_at: new Date('2026-01-01T00:00:00Z')
} as Event;

// #067 — #068 never reached the hour grids. The week grid is a GLYPH view:
// at 320px a day column is (304 - 56)/7 = 35.4px, the chip 31.4px, and after
// the 3px rail + 8px padding + 10px mark + 2px gap only ~8.4px is left — less
// than the ~11.2px the word "AD" needs. So the name rides on the hover hint
// and the chip keeps bag + hatch + solid box.
describe('WeekHourGrid names a sponsored event', () => {
	afterEach(cleanup);

	const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);

	const renderAd = () =>
		render(WeekHourGrid, {
			props: props({
				eventsForDay: (d: DateTime) =>
					d.toISODate() === '2026-09-08' ? [{ ...evt, id: 'ad', title: 'Toy drive', isAd: true }] : []
			})
		});

	it('names the ad on the hover hint, because the word cannot fit', () => {
		renderAd();
		const chip = screen.getByText('Toy drive').closest('button');
		expect(chip?.getAttribute('title')).toBe('Sponsored · Toy drive');
	});

	it('keeps the ad wordless so the title keeps its ~8px', () => {
		renderAd();
		expect(mark('sponsored')?.querySelector('[data-chip-word]')).toBeNull();
		expect(screen.queryByText('Ad')).toBeNull();
	});

	it('hatches the ad chip neutrally and boxes it', () => {
		renderAd();
		const chip = screen.getByText('Toy drive').closest('button');
		expect(chip?.getAttribute('style')).toContain('repeating-linear-gradient');
		expect(chip?.className).toContain('border border-[var(--chip-color)]');
		expect(chip?.className).not.toMatch(/amber/);
	});

	it('leaves an ordinary timed event a bare dot, with no ad wording', () => {
		render(WeekHourGrid, {
			props: props({
				eventsForDay: (d: DateTime) => (d.toISODate() === '2026-09-08' ? [evt] : [])
			})
		});
		const chip = screen.getByText('Standup').closest('button');
		expect(mark('timed')).toBeTruthy();
		expect(mark('timed')?.querySelector('[data-chip-word]')).toBeNull();
		expect(chip?.getAttribute('title')).not.toMatch(/Sponsored/);
		expect(chip?.getAttribute('style')).not.toContain('repeating-linear-gradient');
	});
});
