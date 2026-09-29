import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import type { Event } from '$lib/types';
import MonthDayCell from './MonthDayCell.svelte';

const evt = (id: string, title: string): Event => ({
	id,
	calendarId: 'cal1',
	ownerId: 'user1',
	title,
	date: '2026-09-09T10:00:00',
	start: '2026-09-09T10:00:00',
	end: '2026-09-09T11:00:00',
	description: null,
	location: null,
	allDay: false,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	reminderMinutes: null,
	created_at: new Date('2026-09-01T00:00:00Z')
});

const task = (id: string) => ({
	id,
	title: `Task ${id}`,
	dueDate: '2026-09-09T10:00:00',
	recurrenceFrequency: null
});

const base = {
	day: 9,
	cellDate: DateTime.fromISO('2026-09-09'),
	isTodayDate: false,
	isOtherMonth: false,
	smallScreen: false,
	selectionMode: false,
	calendars: [],
	isSelected: () => false,
	onCellTap: () => {},
	onAdd: () => {},
	onEventClick: () => {},
	onToggleSelect: () => {},
	onTaskClick: () => {},
	onOverflow: () => {}
};

afterEach(cleanup);

describe('MonthDayCell', () => {
	it('renders the day number + event and task chips', () => {
		render(MonthDayCell, {
			props: { ...base, dayEvents: [evt('e1', 'Dentist')], dayTasks: [task('t1')] }
		});
		expect(screen.getByRole('button', { name: 'Open 09-09-2026' })).toBeInTheDocument();
		expect(screen.getByText('Dentist')).toBeInTheDocument();
		expect(screen.getByText('Task t1')).toBeInTheDocument();
	});

	it('caps chips at 3 events + 2 tasks with a +N more button', () => {
		const onOverflow = vi.fn();
		render(MonthDayCell, {
			props: {
				...base,
				dayEvents: [evt('e1', 'A'), evt('e2', 'B'), evt('e3', 'C'), evt('e4', 'D')],
				dayTasks: [task('t1'), task('t2'), task('t3')],
				onOverflow
			}
		});
		expect(screen.queryByText('D')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: '+2 more' })).toBeInTheDocument();
	});

	it('forwards event clicks and selection toggles', async () => {
		const onEventClick = vi.fn();
		const { unmount } = render(MonthDayCell, {
			props: { ...base, dayEvents: [evt('e1', 'Dentist')], dayTasks: [], onEventClick }
		});
		await fireEvent.click(screen.getByText('Dentist'));
		expect(onEventClick).toHaveBeenCalledOnce();
		unmount();

		const onToggleSelect = vi.fn();
		render(MonthDayCell, {
			props: {
				...base,
				dayEvents: [evt('e1', 'Dentist')],
				dayTasks: [],
				selectionMode: true,
				onToggleSelect
			}
		});
		await fireEvent.click(screen.getByText('Dentist'));
		expect(onToggleSelect).toHaveBeenCalledOnce();
	});

	it('forwards the add affordance with the cell date', async () => {
		const onAdd = vi.fn();
		render(MonthDayCell, { props: { ...base, dayEvents: [], dayTasks: [], onAdd } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add on 09-09-2026' }));
		expect(onAdd).toHaveBeenCalledOnce();
	});
});

// #068 — the month cell is a glyph view: at 320px there is no room for a
// word, so the kind rides on the mark's shape alone.
describe('MonthDayCell chip vocabulary', () => {
	afterEach(cleanup);

	const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);

	it('marks a timed event with the dot treatment', () => {
		render(MonthDayCell, {
			props: { ...base, dayEvents: [{ ...evt('e1', 'Dentist'), allDay: false }], dayTasks: [] }
		});
		const el = mark('timed');
		expect(el).toBeTruthy();
		expect(el?.querySelector('[data-chip-a11y]')).toBeNull();
	});

	it('marks an all-day event with a bar, not a dot and not a tint', () => {
		render(MonthDayCell, {
			props: { ...base, dayEvents: [{ ...evt('e1', 'Concert'), allDay: true }], dayTasks: [] }
		});
		expect(mark('allDay')).toBeTruthy();
		expect(mark('timed')).toBeNull();
		expect(screen.getByText('Concert').closest('button')?.getAttribute('style')).not.toContain(
			'background-color'
		);
	});

	it('keeps the kind in a screen-reader phrase when the word cannot fit', () => {
		render(MonthDayCell, {
			props: { ...base, dayEvents: [{ ...evt('e1', 'Concert'), allDay: true }], dayTasks: [] }
		});
		expect(mark('allDay')?.querySelector('[data-chip-a11y]')?.textContent).toBe('All day');
		expect(mark('allDay')?.querySelector('[data-chip-word]')).toBeNull();
	});

	it('marks a task with the dashed ring treatment', () => {
		render(MonthDayCell, { props: { ...base, dayEvents: [], dayTasks: [task('t1')] } });
		expect(mark('task')).toBeTruthy();
	});

	it('marks a sponsored event with the hatched bag treatment', () => {
		render(MonthDayCell, {
			props: { ...base, dayEvents: [{ ...evt('e1', 'Toys'), isAd: true }], dayTasks: [] }
		});
		expect(mark('sponsored')).toBeTruthy();
		expect(mark('timed')).toBeNull();
	});
});

// #067 — a sponsored event names itself in EVERY view. The month cell is a
// glyph view, so "Ad" cannot be shown: the computed bar after the mark is
// ~15px at 320px, and rendering the word there would erase the title. The
// name therefore lands on the hover hint — the same phrase the screen reader
// gets — and the chip keeps three wordless channels: bag, solid box, hatch.
describe('MonthDayCell names a sponsored event', () => {
	afterEach(cleanup);

	const mark = (kind: string) => document.querySelector(`[data-chip-mark="${kind}"]`);
	const chip = () => screen.getByText('Toys').closest('button');

	const renderAd = () =>
		render(MonthDayCell, {
			props: { ...base, dayEvents: [{ ...evt('e1', 'Toys'), isAd: true }], dayTasks: [] }
		});

	it('puts the name on the hover hint, because the word cannot fit', () => {
		renderAd();
		expect(chip()?.getAttribute('title')).toBe('Sponsored · Toys');
	});

	it('stays glyph-only — no visible word to crowd the title out', () => {
		renderAd();
		expect(mark('sponsored')?.querySelector('[data-chip-word]')).toBeNull();
		expect(screen.queryByText('Ad')).toBeNull();
		// The title keeps its room; the mark stays shrink-0 beside it.
		expect(screen.getByText('Toys').className).toContain('min-w-0');
	});

	it('carries the neutral hatch and the solid box, so the ad reads without a word', () => {
		renderAd();
		const style = chip()?.getAttribute('style') ?? '';
		expect(style).toContain('repeating-linear-gradient');
		expect(chip()?.className).toContain('border border-[var(--chip-color)]');
		// Never amber: hue would read as "someone else's calendar colour".
		expect(chip()?.className).not.toMatch(/amber/);
	});

	it('says nothing about ads on a chip that is not sponsored', () => {
		render(MonthDayCell, {
			props: { ...base, dayEvents: [{ ...evt('e1', 'Toys'), isAd: false }], dayTasks: [] }
		});
		expect(chip()?.getAttribute('title')).toBe('Toys');
		expect(mark('sponsored')).toBeNull();
		expect(chip()?.getAttribute('style')).not.toContain('repeating-linear-gradient');
	});
});
