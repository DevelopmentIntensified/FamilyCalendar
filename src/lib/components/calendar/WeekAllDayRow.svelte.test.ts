import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import WeekAllDayRow from './WeekAllDayRow.svelte';
import type { Event } from '$lib/types';

const MONDAY = DateTime.fromISO('2026-09-07T12:00:00');
const weekDays = Array.from({ length: 7 }, (_, i) => MONDAY.plus({ days: i }));

// SAFETY: fixture covers the Event fields WeekAllDayRow renders; auditing
// columns are irrelevant here.

const evt = {
	id: 'e1',
	ownerId: 'u1',
	calendarId: 'cal1',
	title: 'Holiday',
	date: '2026-09-08',
	start: '2026-09-08T00:00:00',
	end: '2026-09-08T23:59:00',
	description: null,
	location: null,
	allDay: true,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	reminderMinutes: null,
	created_at: new Date('2026-01-01T00:00:00Z')
} as Event;

// SAFETY: WeekAllDayRow reads only id/title/dueDate off tasks.
const task = { id: 't1', title: 'Buy milk', dueDate: '2026-09-08' } as never;

describe('WeekAllDayRow', () => {
	afterEach(cleanup);

	it('renders all-day events + tasks and fires clicks', async () => {
		const props = {
			weekDays,
			eventsForDay: (d: DateTime) => (d.toISODate() === '2026-09-08' ? [evt] : []),
			tasksForDay: (d: DateTime) => (d.toISODate() === '2026-09-08' ? [task] : []),
			selectionMode: false,
			isSelected: () => false,
			onEventClick: vi.fn(),
			onOpenTask: vi.fn()
		};
		render(WeekAllDayRow, { props });
		await fireEvent.click(screen.getByText('Holiday'));
		expect(props.onEventClick).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByText('Buy milk'));
		expect(props.onOpenTask).toHaveBeenCalledOnce();
	});
});

// #068 — the week band is also a glyph view: its gutter header already reads
// "All day" for every column, so a word per chip would be pure repetition.
describe('WeekAllDayRow chip vocabulary', () => {
	afterEach(cleanup);

	const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);

	it('marks all-day events and tasks with the shared treatments', () => {
		render(WeekAllDayRow, {
			props: {
				weekDays,
				eventsForDay: (d: DateTime) => (d.toISODate() === '2026-09-08' ? [evt] : []),
				tasksForDay: (d: DateTime) => (d.toISODate() === '2026-09-08' ? [task] : []),
				selectionMode: false,
				isSelected: () => false,
				onEventClick: vi.fn(),
				onOpenTask: vi.fn()
			}
		});
		expect(mark('allDay')).toBeTruthy();
		expect(mark('task')).toBeTruthy();
	});

	it('carries the kind without a per-chip word', () => {
		render(WeekAllDayRow, {
			props: {
				weekDays,
				eventsForDay: (d: DateTime) => (d.toISODate() === '2026-09-08' ? [evt] : []),
				tasksForDay: () => [],
				selectionMode: false,
				isSelected: () => false,
				onEventClick: vi.fn(),
				onOpenTask: vi.fn()
			}
		});
		expect(mark('allDay')?.querySelector('[data-chip-a11y]')?.textContent).toBe('All day');
		expect(mark('allDay')?.querySelector('[data-chip-word]')).toBeNull();
	});
});

// #067 — the week band is a glyph view for the same reason as the month cell,
// so the sponsored name rides on the hover hint, not on a word. The band had
// NO title attribute at all before, which is why an ad here was nameless.
describe('WeekAllDayRow names a sponsored event', () => {
	afterEach(cleanup);

	const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);
	const ad = { ...evt, id: 'e2', title: 'Toy drive', isAd: true } as Event;

	function renderAd(on: 'ad' | 'plain' = 'ad') {
		render(WeekAllDayRow, {
			props: {
				weekDays,
				eventsForDay: (d: DateTime) =>
					d.toISODate() === '2026-09-08' ? [on === 'ad' ? ad : evt] : [],
				tasksForDay: () => [],
				selectionMode: false,
				isSelected: () => false,
				onEventClick: vi.fn(),
				onOpenTask: vi.fn()
			}
		});
		// The chip is the title's closest button by construction; assert it so a
		// layout change fails loudly rather than reading a null attribute.
		const chip = screen.getByText(on === 'ad' ? 'Toy drive' : 'Holiday').closest('button');
		if (!chip) throw new Error('chip not found');
		return chip;
	}

	it('names the ad on the hover hint', () => {
		expect(renderAd().getAttribute('title')).toBe('Sponsored · Toy drive');
	});

	it('keeps the ad wordless so the title keeps its bar', () => {
		renderAd();
		expect(mark('sponsored')?.querySelector('[data-chip-word]')).toBeNull();
		expect(screen.queryByText('Ad')).toBeNull();
	});

	it('hatches the ad neutrally and boxes it, so it reads without a word', () => {
		const chip = renderAd();
		expect(chip.getAttribute('style')).toContain('repeating-linear-gradient');
		expect(chip.className).toContain('border border-[var(--chip-color)]');
		expect(chip.className).not.toMatch(/amber/);
	});

	it('never calls a non-sponsored chip an ad', () => {
		const chip = renderAd('plain');
		expect(chip.getAttribute('title')).not.toMatch(/Sponsored/);
		expect(mark('sponsored')).toBeNull();
		expect(chip.getAttribute('style')).not.toContain('repeating-linear-gradient');
	});
});
