/**
 * The printable month's grid ("fridge sheet"): the month padded to whole weeks
 * from the `weekStart` setting, each cell carrying its items with the fridge
 * sheet's own time wording. Ported from `printData.ts`; the loader (dates,
 * settings, family name) stays in the service.
 *
 * "Today" arrives as `todayIso` (the viewer's zone), so this file never reads
 * the clock. The month clamp into 1–12 and the month arithmetic are the
 * service's/kernel's; this file only lays the cells out.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { dayKey } from '$lib/kernel/time/dates';

export type WeekStart = 'sunday' | 'monday';

export const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
] as const;

/** One printed item: the event's display colour and its fridge-sheet time. */
export interface PrintCellItem {
	readonly title: string;
	readonly color: string;
	readonly allDay: boolean;
	/** `null` for all-day items and for an unreadable start. */
	readonly time: string | null;
}

export interface PrintCell {
	readonly day: number;
	readonly iso: string;
	readonly inMonth: boolean;
	readonly isToday: boolean;
	readonly items: PrintCellItem[];
}

/** An item the grid may place: its display fields plus the day it belongs to. */
export interface PrintSourceItem {
	readonly title: string;
	readonly color: string;
	readonly allDay: boolean;
	readonly start: Date | string;
	/** The viewer-zone day the item was split onto. */
	readonly date: Date | string;
}

export interface PrintGridInput {
	readonly year: number;
	readonly month: number;
	readonly weekStart: WeekStart;
	/** The viewer's `yyyy-MM-dd` "today". */
	readonly todayIso: string;
	readonly items: readonly PrintSourceItem[];
	readonly zone: string;
}

/**
 * Short fridge-sheet start time: `9a`, `2p`, `2:30p` — American, no padding.
 * An invalid instant prints as `''`.
 */
export function shortTime(instant: Date | string, zone: string): string {
	const text = typeof instant === 'string' ? instant.trim().replace(' ', 'T') : instant;
	const dt =
		text instanceof Date
			? DateTime.fromJSDate(text, { zone })
			: DateTime.fromISO(text, { zone: 'utc' }).setZone(zone);
	if (!dt.isValid) return '';
	const hour24 = dt.hour;
	const suffix = hour24 < 12 ? 'a' : 'p';
	const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
	const minute = dt.minute;
	return minute === 0 ? `${hour}${suffix}` : `${hour}:${String(minute).padStart(2, '0')}${suffix}`;
}

/** `prev`/`next` roll across the year. */
export function monthNeighbours(year: number, month: number): {
	prev: { year: number; month: number };
	next: { year: number; month: number };
} {
	return {
		prev: month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 },
		next: month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
	};
}

/**
 * Lay the requested month out as whole weeks starting on `weekStart`, padded
 * with the neighbouring months' days. Every item lands on the cell whose
 * viewer-zone day it was split onto; all-day items are timeless.
 */
export function calendarPrintGrid(input: PrintGridInput): PrintCell[] {
	const { year, month, weekStart, todayIso, items, zone } = input;
	const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const offset = weekStart === 'monday' ? 1 : 0;
	const firstWeekday = (firstOfMonth.getUTCDay() - offset + 7) % 7;
	const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

	const grid: PrintCell[] = [];
	for (let index = 0; index < totalCells; index++) {
		const cellDate = new Date(Date.UTC(year, month - 1, index - firstWeekday + 1));
		const iso = cellDate.toISOString().slice(0, 10);
		const inMonth = cellDate.getUTCMonth() + 1 === month;

		const cellItems: PrintCellItem[] = items
			.filter((item) => dayKey(item.date, zone) === iso)
			.map((item) => {
				const start = item.start instanceof Date ? item.start : new Date(String(item.start));
				return {
					title: String(item.title),
					color: String(item.color),
					allDay: item.allDay,
					time:
						item.allDay || Number.isNaN(start.getTime())
							? null
							: shortTime(start, zone) || null
				};
			});

		grid.push({
			day: cellDate.getUTCDate(),
			iso,
			inMonth,
			isToday: iso === todayIso,
			items: cellItems
		});
	}
	return grid;
}
