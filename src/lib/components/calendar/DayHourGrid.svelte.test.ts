import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import DayHourGrid from './DayHourGrid.svelte';
import { measureBox, MIN_TOUCH } from '$lib/utils/touchTarget';
import type { Event } from '$lib/types';

const TUESDAY = DateTime.fromISO('2026-09-08T12:00:00');

// SAFETY: fixture covers the Event fields DayHourGrid renders.
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
	created_at: new Date('2026-01-01T00:00:00Z')
} as Event;

function props(overrides = {}) {
	return {
		pxPerHour: 56,
		gridHeight: 1344,
		selectedDate: TUESDAY,
		isToday: false,
		nowPct: 50,
		laidOut: [],
		selecting: null,
		rangeSel: null,
		addMode: false,
		selectionMode: false,
		isSelected: () => false,
		rangeTouchAction: () => ({ update: () => {}, destroy: () => {} }),
		onGridDrop: vi.fn(),
		onGridClick: vi.fn(),
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

describe('DayHourGrid', () => {
	afterEach(cleanup);

	it('renders the grid, hours and laid-out events', async () => {
		const p = props({
			laidOut: [{ event: evt, lane: 0, lanes: 1, topPct: 40, heightPct: 5 }]
		});
		render(DayHourGrid, { props: p });
		expect(screen.getByTestId('day-grid')).toBeInTheDocument();
		expect(screen.getByText('Standup')).toBeInTheDocument();
		await fireEvent.click(screen.getByText('Standup'));
		expect(p.onEventClick).toHaveBeenCalledOnce();
	});

	it('shows the range popover with working steppers', async () => {
		const p = props({
			rangeSel: { day: TUESDAY, startMin: 120, endMin: 240 }
		});
		render(DayHourGrid, { props: p });
		expect(screen.getByText('2:00 AM – 4:00 AM')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Extend by 15 minutes' }));
		expect(p.onStepRangeEnd).toHaveBeenCalledWith(15);
		await fireEvent.click(screen.getByRole('button', { name: 'Create event for selected time' }));
		expect(p.onCreateRange).toHaveBeenCalledOnce();
	});
});

// Issue 015: the range steppers were `px-1.5 py-1 text-[11px]` = 23.2px tall —
// half the 44px target, on the controls you thumb most in the day view. The
// popover is anchored by its top edge, so a min-height grows it downward and
// leaves the grid geometry (PX_PER_HOUR, hour lines, hit-testing) untouched.
describe('DayHourGrid touch targets', () => {
	afterEach(cleanup);

	it('gives every range-popover control a 44px target', () => {
		render(DayHourGrid, {
			props: props({ rangeSel: { day: TUESDAY, startMin: 120, endMin: 240 } })
		});
		for (const name of [
			'Shorten by 15 minutes',
			'Extend by 15 minutes',
			'Create event for selected time',
			'Dismiss time selection'
		]) {
			// SAFETY: each control is a <button> in DayHourGrid.
			const btn = screen.getByRole('button', { name }) as HTMLButtonElement;
			expect(`${name}: ${measureBox(btn.className).height}`).toBe(`${name}: ${MIN_TOUCH}`);
		}
	});

	it('leaves the grid geometry the other ticket owns alone', () => {
		const { container } = render(DayHourGrid, {
			props: props({
				pxPerHour: 56,
				gridHeight: 1344,
				laidOut: [{ event: evt, lane: 0, lanes: 1, topPct: 40, heightPct: 5 }],
				rangeSel: { day: TUESDAY, startMin: 120, endMin: 240 }
			})
		});
		// SAFETY: the grid body is the [data-testid="day-grid"] element.
		const grid = container.querySelector('[data-testid="day-grid"]') as HTMLElement;
		expect(grid.style.height).toBe('1344px');
		// SAFETY: the event chip is a <button> in DayHourGrid.
		const chip = screen.getByText('Standup').closest('button') as HTMLElement;
		expect(chip.style.height).toBe(`${Math.max(5, (26 / 1344) * 100)}%`);
	});
});

// #067 — #068 never reached the hour grids, so an ad there was a bare colour
// bar: no bag, no hatch, no word. The day grid is a WORD view — a single
// column keeps ~250px of chip at 320px, so the word fits beside the title.
describe('DayHourGrid names a sponsored event', () => {
	afterEach(cleanup);

	const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);

	const renderAd = () =>
		render(DayHourGrid, {
			props: props({
				laidOut: [
					{ event: { ...evt, id: 'ad', title: 'Toy drive', isAd: true }, lane: 0, lanes: 1, topPct: 40, heightPct: 5 }
				]
			})
		});

	it('marks the ad and spells it out', () => {
		renderAd();
		expect(mark('sponsored')).toBeTruthy();
		expect(mark('sponsored')?.querySelector('[data-chip-word]')?.textContent).toBe('Ad');
	});

	it('hatches the chip neutrally, so an ad never reads as a calendar colour', () => {
		renderAd();
		const chip = screen.getByText('Toy drive').closest('button');
		expect(chip?.getAttribute('style')).toContain('repeating-linear-gradient');
		expect(chip?.className).not.toMatch(/amber/);
	});

	it('leaves an ordinary timed event with a bare dot and no word', () => {
		render(DayHourGrid, {
			props: props({ laidOut: [{ event: evt, lane: 0, lanes: 1, topPct: 40, heightPct: 5 }] })
		});
		expect(mark('timed')).toBeTruthy();
		expect(mark('timed')?.querySelector('[data-chip-word]')).toBeNull();
		expect(screen.queryByText('Ad')).toBeNull();
	});
});
