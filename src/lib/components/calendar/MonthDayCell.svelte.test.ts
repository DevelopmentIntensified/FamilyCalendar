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

/**
 * #128 gaps 2 + 6 — Prototype E, transcribed. E's cell is 14px, `#e2e8f0`,
 * white, 8px/10px, with a weekend gradient; and its height is `height`, never
 * `min-height`, "a busy Tuesday is not allowed to push the bottom of the month
 * off the screen".
 *
 * The `min-h-` was the whole of gap 2 and it was measured, not guessed: with a
 * busy September fixture in a real browser at 375×812 the busiest day cell
 * rendered **182px** tall (the minimum is 72), the grid came to **867px** and
 * the page to **1111px** — 291px of month below an 812px fold. `overflow-hidden`
 * clips only AFTER a box has grown, which is why the minimum, not the overflow,
 * was the defect.
 *
 * jsdom has no layout, so the shape is asserted where it can be: the cell's own
 * classes. Every one of these is a boundary that can silently move back.
 */
describe('MonthDayCell cell height (#128 gap 2 — the grid is the page)', () => {
	afterEach(cleanup);

	const cellRoot = () => document.querySelector('[data-testid="month-day-cell"]')!;

	it('fixes the cell height at every step instead of only flooring it', () => {
		render(MonthDayCell, { props: { ...base, dayEvents: [], dayTasks: [] } });
		const cls = cellRoot().className;
		// `height`, not `min-height`: a minimum is a licence to grow, and growing
		// is what pushed the bottom of the month off a phone.
		expect(cls).toMatch(/(^|\s)h-\[72px\]/);
		expect(cls).not.toMatch(/min-h-\[72px\]/);
		// md = 768px = VIEW_BREAKPOINT_PX. `sm` = 640px is a different number.
		expect(cls).toMatch(/(^|\s)md:h-\[92px\]/);
		expect(cls).toMatch(/(^|\s)lg:h-\[104px\]/);
		expect(cls).not.toMatch(/sm:h-\[/);
	});

	it('grows the cell in steps, so no width is handed the wrong one', () => {
		//  0–767  : phone cell (72)   — 640px is NOT tall enough
		// 768–1023: tablet cell (92)  — six rows plus the toolbar fit a 768 screen
		// 1024+    : desktop cell (104)
		render(MonthDayCell, { props: { ...base, dayEvents: [], dayTasks: [] } });
		const heights = [...cellRoot().className.matchAll(/(?:^|\s)([a-z]+:)?h-\[(\d+)px\]/g)].map(
			(m) => [m[1] ?? '', Number(m[2])] as const
		);
		expect(heights).toEqual([
			['', 72],
			['md:', 92],
			['lg:', 104]
		]);
	});

	it('clips, so a busy Tuesday cannot push the bottom of the month off the screen', () => {
		// E clips, and says so. Clipping is only safe once the box can no longer
		// grow, which is why the fixed height above and this go together.
		render(MonthDayCell, { props: { ...base, dayEvents: [], dayTasks: [] } });
		expect(cellRoot().className).toMatch(/overflow-hidden/);
	});

	it('clips the chips, not the whole cell, so the overflow button stays reachable', () => {
		// The escape hatch for a clipped day is the `+N more` button. E clips it
		// away; on a phone the day tap opens the day-action sheet instead, but
		// from `sm` up this button is the only way into the day's full list, so
		// it must sit outside the region that clips.
		render(MonthDayCell, {
			props: {
				...base,
				dayEvents: [evt('e1', 'A'), evt('e2', 'B'), evt('e3', 'C'), evt('e4', 'D')],
				dayTasks: []
			}
		});
		const more = screen.getByRole('button', { name: '+1 more' });
		const chips = document.querySelector('[data-testid="month-chips"]')!;
		expect(chips.className).toMatch(/overflow-hidden/);
		expect(chips.contains(more)).toBe(false);
	});
});

/** #128 gap 4 — E draws the per-cell tools at EVERY width, hover-revealed. */
describe('MonthDayCell per-cell tools (#128 gap 4)', () => {
	afterEach(cleanup);

	const tools = () => screen.getByRole('button', { name: 'Add on 09-09-2026' }).parentElement!;

	it('renders them at every width, not from md up', () => {
		// E: "present at every width, hover-revealed via opacity:0". The app hid
		// them below `md`, so a 375px phone had a cell with no `+` on it.
		render(MonthDayCell, { props: { ...base, dayEvents: [], dayTasks: [] } });
		expect(tools().className).not.toMatch(/\bhidden\b/);
		expect(tools().className).not.toMatch(/\bmd:flex\b/);
		expect(tools().className).not.toMatch(/\bsm:flex\b/);
	});

	it('hides them until the cell is hovered or something inside is focused', () => {
		render(MonthDayCell, { props: { ...base, dayEvents: [], dayTasks: [] } });
		const cls = tools().className;
		expect(cls).toMatch(/\bopacity-0\b/);
		expect(cls).toMatch(/group-hover:opacity-100/);
		// Keyboard parity: tabbing to the tool must reveal it, or it is a control
		// nobody can find.
		expect(cls).toMatch(/focus-within:opacity-100/);
	});

	it('leaves an un-hovered tool unclickable, so an invisible one is not a trap', () => {
		// `opacity:0` alone would leave a 20px invisible target live under the
		// thumb. E has that bug; it is not worth porting.
		render(MonthDayCell, { props: { ...base, dayEvents: [], dayTasks: [] } });
		expect(screen.getByRole('button', { name: 'Add on 09-09-2026' }).className).toMatch(
			/pointer-events-none/
		);
		expect(screen.getByRole('button', { name: 'Add on 09-09-2026' }).className).toMatch(
			/group-hover:pointer-events-auto/
		);
	});
});

/** #128 gap 5 — E draws a 28px disc on EVERY day; the app drew 20px, on today only. */
describe('MonthDayCell day-number disc (#128 gap 5)', () => {
	afterEach(cleanup);

	const disc = () => document.querySelector('[data-testid="day-disc"]')!;

	it('is a 28px circle on an ordinary day, not only on today', () => {
		render(MonthDayCell, {
			props: { ...base, isTodayDate: false, dayEvents: [], dayTasks: [] }
		});
		expect(disc().className).toMatch(/\bh-7\b/);
		expect(disc().className).toMatch(/\bw-7\b/);
		expect(disc().className).toMatch(/rounded-full/);
	});

	it('keeps the disc the same size today, so today reads as a fill not a size', () => {
		render(MonthDayCell, {
			props: { ...base, isTodayDate: true, dayEvents: [], dayTasks: [] }
		});
		expect(disc().className).toMatch(/\bh-7\b/);
		expect(disc().className).toMatch(/bg-primary-600/);
		expect(disc().className).toMatch(/text-white/);
	});

	it('mutes an out-of-month day by ink, never by dropping the circle', () => {
		render(MonthDayCell, {
			props: { ...base, isOtherMonth: true, dayEvents: [], dayTasks: [] }
		});
		expect(disc().className).toMatch(/rounded-full/);
		expect(disc().className).toMatch(/text-slate-400/);
	});
});

/** #128 gap 6 — E's cell chrome: 14px, `#e2e8f0`, white, 8px/10px, weekend wash. */
describe('MonthDayCell chrome (#128 gap 6)', () => {
	afterEach(cleanup);

	const cellRoot = () => document.querySelector('[data-testid="month-day-cell"]')!;

	it("wears E's radius, border and background", () => {
		render(MonthDayCell, {
			props: { ...base, dayEvents: [], dayTasks: [] }
		});
		const cls = cellRoot().className;
		// 0.875rem = 14px; --s200 = #e2e8f0 = slate-200; the card is white.
		expect(cls).toMatch(/rounded-\[14px\]/);
		expect(cls).toMatch(/\bbg-white\b/);
		expect(cls).toMatch(/border-slate-200/);
		expect(cls).not.toMatch(/border-slate-100/);
		expect(cls).not.toMatch(/rounded-lg\b/);
	});

	it('pads 8px across and 10px below, like E, instead of 2px all round', () => {
		render(MonthDayCell, { props: { ...base, dayEvents: [], dayTasks: [] } });
		const cls = cellRoot().className;
		expect(cls).toMatch(/\bpx-2\b/);
		expect(cls).toMatch(/\bpt-2\b/);
		expect(cls).toMatch(/\bpb-2\.5\b/);
		expect(cls).not.toMatch(/\bp-0\.5\b/);
	});

	it('washes a weekend day, and only a weekend day', () => {
		// 2026-09-12 is a Saturday, 2026-09-09 a Wednesday.
		render(MonthDayCell, {
			props: {
				...base,
				cellDate: DateTime.fromISO('2026-09-12'),
				day: 12,
				dayEvents: [],
				dayTasks: []
			}
		});
		expect(cellRoot().className).toMatch(/bg-gradient-to-b/);
		cleanup();
		render(MonthDayCell, { props: { ...base, dayEvents: [], dayTasks: [] } });
		expect(cellRoot().className).not.toMatch(/bg-gradient-to-b/);
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
