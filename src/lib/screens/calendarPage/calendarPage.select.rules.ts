/**
 * calendarPage range-select rules: the one drag/long-press machine the day and
 * week grids share.
 *
 * Legacy carried verbatim copies in WeekView and DayView (#046); the only
 * variance was the day on the in-progress/range shapes (week grids carry a day,
 * day grids a single column) and the pixels-per-hour constant. The machine
 * ALWAYS carries `day`, takes `pxPerHour` as a constructor argument and stays
 * framework-free: the view syncs its three public fields after each call.
 *
 * The minute math is the calendar's move math (`snapMinutes`/`yToMinutes`/
 * `normalizeRange`): 15-minute snapping and a degenerate drag becoming a
 * 30-minute block. It is private here because no other v2 caller needs it yet;
 * when calendar's entry exports its move math, this file should import it
 * rather than keep the second copy (reported as an S7 follow-up).
 *
 * Ported from legacy `src/lib/utils/rangeSelect.ts` (#046/#047).
 *
 * Doc: ./README.md#day-and-week-views
 */
import type { DateTime } from 'luxon';

/** The drag currently being painted, in minutes since midnight. */
export interface CalendarRangeSelecting {
	day: DateTime;
	anchorMin: number;
	curMin: number;
}

/** A finalized range, ready for the Create popover. */
export interface CalendarRangeSelection {
	day: DateTime;
	startMin: number;
	endMin: number;
}

export interface CalendarRangeFlags {
	selectionMode: boolean;
	addMode: boolean;
}

const SELECT_SNAP_MINUTES = 15;
const SELECT_LONG_PRESS_MS = 450;
const SELECT_MOUSE_PX = 6;
const SELECT_TOUCH_MIN_DELTA_MIN = 2;
const SELECT_SCROLL_PX = 10;

/** Snap minutes-since-midnight to the grid, clamped to the day. */
function snapMinutes(minutes: number, step: number = SELECT_SNAP_MINUTES): number {
	return Math.min(24 * 60 - step, Math.max(0, Math.round(minutes / step) * step));
}

/** Pointer Y within a px-per-hour grid → snapped minutes-since-midnight. */
function yToMinutes(clientY: number, gridTop: number, pxPerHour: number): number {
	return snapMinutes(((clientY - gridTop) / pxPerHour) * 60);
}

/**
 * Normalize a drag anchor + current pointer into an ordered [start, end] minute
 * pair. Degenerate drags become a 30-minute block.
 */
function normalizeRange(anchorMinutes: number, currentMinutes: number): [number, number] {
	const start = snapMinutes(Math.min(anchorMinutes, currentMinutes));
	let end = snapMinutes(Math.max(anchorMinutes, currentMinutes));
	if (end - start < SELECT_SNAP_MINUTES) end = Math.min(24 * 60, start + 30);
	return [start, end];
}

export class RangeSelectMachine {
	selecting: CalendarRangeSelecting | null = null;
	rangeSel: CalendarRangeSelection | null = null;
	suppressClick = false;

	private longPressTimer: ReturnType<typeof setTimeout> | null = null;
	private longPressStartY = 0;

	constructor(
		private readonly pxPerHour: number,
		private readonly longPressMs = SELECT_LONG_PRESS_MS
	) {}

	/** Y-pixel → minutes-since-midnight for a grid whose top edge is gridTop. */
	minutesFromClientY(clientY: number, gridTop: number): number {
		return yToMinutes(clientY, gridTop, this.pxPerHour);
	}

	// ---- mouse drag (desktop) ----

	beginDrag(day: DateTime, minutes: number): void {
		this.rangeSel = null;
		this.selecting = { day, anchorMin: minutes, curMin: minutes };
	}

	/**
	 * Extend the drag; marks suppressClick once movement exceeds minDelta
	 * minutes (mouse: pixel threshold converted; touch: fixed 2min).
	 */
	dragTo(minutes: number, minDelta: number): void {
		if (!this.selecting) return;
		this.selecting = { ...this.selecting, curMin: minutes };
		if (Math.abs(this.selecting.curMin - this.selecting.anchorMin) > minDelta) {
			this.suppressClick = true;
		}
	}

	/** Mouse-pixel movement that counts as a drag (was: >6px on the grid). */
	mouseMinDelta(): number {
		return SELECT_MOUSE_PX / (this.pxPerHour / 60);
	}

	/** Mouse-up / Add-mode touch-end: real drags finalize, plain taps clear. */
	endDrag(): void {
		if (!this.selecting) return;
		if (this.suppressClick) this.finalize();
		else this.selecting = null;
	}

	finalize(): void {
		if (!this.selecting) return;
		const [startMin, endMin] = normalizeRange(this.selecting.anchorMin, this.selecting.curMin);
		this.rangeSel = { day: this.selecting.day, startMin, endMin };
		this.selecting = null;
	}

	/**
	 * Empty-grid click guard: a drag/long-press that just finalized must not
	 * fall through to single-time create. Returns true when the click is
	 * consumed.
	 */
	consumeSuppressClick(): boolean {
		if (this.suppressClick) {
			this.suppressClick = false;
			return true;
		}
		return false;
	}

	// ---- touch (long-press default, instant drag in Add mode) ----

	touchStart(
		day: DateTime,
		clientY: number,
		anchorMin: number,
		flags: CalendarRangeFlags,
		onFire: () => void
	): void {
		if (flags.selectionMode) return;
		if (!Number.isFinite(anchorMin)) return;
		this.clearLongPress();
		if (flags.addMode) {
			// Add mode (#047): drag selects immediately — no long-press, and
			// the grid runs touch-action:none so the drag never scrolls.
			this.rangeSel = null;
			this.selecting = { day, anchorMin, curMin: anchorMin };
			return;
		}
		this.longPressStartY = clientY;
		this.longPressTimer = setTimeout(() => {
			// Long-press selects a default one-hour block; the popover steppers
			// refine it (no gesture fighting with scroll).
			this.suppressClick = true;
			this.rangeSel = null;
			this.selecting = { day, anchorMin, curMin: Math.min(24 * 60, anchorMin + 60) };
			this.finalize();
			onFire();
		}, this.longPressMs);
	}

	touchMove(clientY: number, minutes: number | null, addMode: boolean): void {
		if (addMode && this.selecting && minutes !== null) {
			this.dragTo(minutes, SELECT_TOUCH_MIN_DELTA_MIN);
			return;
		}
		if (!this.longPressTimer) return;
		// Finger moved before the long-press fired: it's a scroll, not a select.
		if (Math.abs(clientY - this.longPressStartY) > SELECT_SCROLL_PX) this.clearLongPress();
	}

	touchEnd(addMode: boolean): void {
		if (addMode && this.selecting) {
			this.endDrag();
			return;
		}
		this.clearLongPress();
	}

	// ---- popover steppers + create ----

	stepEnd(delta: number): void {
		if (!this.rangeSel) return;
		this.rangeSel = {
			...this.rangeSel,
			endMin: Math.min(24 * 60, Math.max(this.rangeSel.startMin + 15, this.rangeSel.endMin + delta))
		};
	}

	/** Resolved datetimes for the popover Create action (null when no range). */
	rangeEndpoints(): { start: DateTime; end: DateTime } | null {
		if (!this.rangeSel) return null;
		const base = this.rangeSel.day.startOf('day');
		return {
			start: base.plus({ minutes: this.rangeSel.startMin }),
			end: base.plus({ minutes: this.rangeSel.endMin })
		};
	}

	clearLongPress(): void {
		if (this.longPressTimer) {
			clearTimeout(this.longPressTimer);
			this.longPressTimer = null;
		}
	}

	destroy(): void {
		this.clearLongPress();
	}
}
