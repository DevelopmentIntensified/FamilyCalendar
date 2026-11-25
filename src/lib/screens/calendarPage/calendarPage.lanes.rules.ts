/**
 * calendarPage lane rules: the greedy day-timeline layout the day and week
 * grids share, and the now-line position.
 *
 * Lane count is per overlap cluster, not per day (#066): a lone 7pm event keeps
 * the full column even when two unrelated events collide at 9am. `lane` is
 * 0-based within its cluster and always `< lanes`, so a chip never crosses into
 * the neighbouring day's hit area.
 *
 * Ported from legacy `src/lib/utils/dayViewLayout.ts`; the clock read in
 * `nowPositionPct()` dies — `nowLinePercent(now, zone)` is a parameter (R5).
 *
 * Doc: ./README.md#day-and-week-views
 */
import { DateTime } from 'luxon';

/**
 * A timed row as the grid gives it to the layout. `start` may be absent (the
 * screen's row carries the display `date` as the fallback) and `allDay` may be
 * the row's own nullable flag: an unplaceable row still keeps its slot at
 * midnight rather than disappearing.
 */
export interface CalendarTimelineRow {
	start?: Date | string | null;
	end?: Date | string | null;
	allDay?: boolean | null;
}

export interface CalendarLaneSlot<T extends CalendarTimelineRow> {
	row: T;
	lane: number;
	lanes: number;
	/** Position and height as percentages of the 24-hour day. */
	topPct: number;
	heightPct: number;
}

export const CALENDAR_MINUTES_PER_DAY = 24 * 60;
export const CALENDAR_DEFAULT_DURATION_MIN = 60;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The instant in `zone`. Same rule as kernel/time: a date-time without an
 * offset is UTC (Postgres `timestamp` semantics), then converted; a date-only
 * string is that calendar day in the zone.
 */
function instantIn(value: Date | string, zone: string): DateTime | null {
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return null;
		return DateTime.fromJSDate(value, { zone });
	}
	const text = value.trim().replace(' ', 'T');
	if (!text) return null;
	const parsed = DATE_ONLY.test(text)
		? DateTime.fromISO(text, { zone })
		: DateTime.fromISO(text, { zone: 'utc' }).setZone(zone);
	return parsed.isValid ? parsed : null;
}

/** An event's slot on the day timeline, in minutes from midnight. */
function spanMinutes(row: CalendarTimelineRow, zone: string): { startMin: number; endMin: number } {
	const start = row.start ? instantIn(row.start, zone) : null;
	// An absent or unparseable start cannot be placed by clock time; midnight
	// keeps the row on screen rather than silently dropping a plan.
	const startMin = start ? start.hour * 60 + start.minute : 0;
	let endMin = startMin + CALENDAR_DEFAULT_DURATION_MIN;
	if (row.end) {
		const end = instantIn(row.end, zone);
		if (end) endMin = Math.max(endMin, end.hour * 60 + end.minute);
	}
	return { startMin, endMin };
}

/**
 * Greedy lane layout for a day's timed events, positions as percentages of the
 * day so any pixel scale can render them. Results come back in the caller's
 * order; the lane pass reads the day by clock time regardless.
 */
export function layoutCalendarDaySlots<T extends CalendarTimelineRow>(
	rows: readonly T[],
	zone: string
): CalendarLaneSlot<T>[] {
	const spans = rows.map((row) => spanMinutes(row, zone));
	const order = spans
		.map((span, index) => ({ span, index }))
		.sort((a, b) => a.span.startMin - b.span.startMin);

	const laneEnds: number[] = [];
	const laneOf: number[] = new Array(rows.length);
	const lanesOf: number[] = new Array(rows.length);
	// `runEnd` is the latest end in the open cluster; an event starting at or
	// after it opens a new one (half-open intervals: 10:30 does not overlap a
	// 10:30 finish).
	let runFrom = 0;
	let runEnd = -1;
	let runLanes = 0;
	for (let position = 0; position < order.length; position++) {
		const { span, index } = order[position];
		if (position > 0 && span.startMin >= runEnd) {
			for (let j = runFrom; j < position; j++) lanesOf[order[j].index] = runLanes;
			runFrom = position;
			runLanes = 0;
		}
		runEnd = Math.max(runEnd, span.endMin);

		let lane = laneEnds.findIndex((end) => span.startMin >= end);
		if (lane === -1) lane = laneEnds.length;
		laneEnds[lane] = span.endMin;
		laneOf[index] = lane;
		// Lane indices inside a cluster are contiguous from 0 (its first event
		// always finds lane 0 free), so the highest index is the cluster's peak.
		runLanes = Math.max(runLanes, lane + 1);
	}
	for (let j = runFrom; j < order.length; j++) lanesOf[order[j].index] = runLanes;

	return rows.map((row, index) => {
		const { startMin, endMin } = spans[index];
		return {
			row,
			lane: laneOf[index],
			lanes: lanesOf[index],
			topPct: (startMin / CALENDAR_MINUTES_PER_DAY) * 100,
			heightPct:
				(Math.min(endMin - startMin, CALENDAR_MINUTES_PER_DAY - startMin) /
					CALENDAR_MINUTES_PER_DAY) *
				100
		};
	});
}

/**
 * Vertical position of `now` as a percentage of the day (0-100). Invalid input
 * sits at midnight rather than painting the line off the grid.
 */
export function nowLinePercent(now: Date | string, zone: string): number {
	const instant = instantIn(now, zone);
	if (!instant) return 0;
	return ((instant.hour * 60 + instant.minute) / CALENDAR_MINUTES_PER_DAY) * 100;
}
