import { DateTime } from 'luxon';
import { normalizeRange, yToMinutes } from './eventMove';

/**
 * Shared time-range-select state machine (#046 unification).
 *
 * WeekView and DayView carried verbatim copies of this logic (mouse drag,
 * long-press + Add-mode touch, steppers); the only variance was Week's
 * `day` on the in-progress/range shapes (Day is single-column) and the
 * pixels-per-hour constant. The machine ALWAYS carries `day`, takes
 * `pxPerHour` as a constructor arg, and stays framework-free: legacy
 * components sync its three public fields into local `let`s after each
 * call so assignments keep triggering updates.
 */

export interface RangeSelecting {
	day: DateTime;
	anchorMin: number;
	curMin: number;
}

export interface RangeSelection {
	day: DateTime;
	startMin: number;
	endMin: number;
}

export interface RangeSelectFlags {
	selectionMode: boolean;
	addMode: boolean;
}

const DAY_MINUTES = 24 * 60;

export class RangeSelectMachine {
	selecting: RangeSelecting | null = null;
	rangeSel: RangeSelection | null = null;
	suppressClick = false;

	private longPressTimer: ReturnType<typeof setTimeout> | null = null;
	private longPressStartY = 0;

	constructor(
		private readonly pxPerHour: number,
		private readonly longPressMs = 450
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
		return 6 / (this.pxPerHour / 60);
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
		flags: RangeSelectFlags,
		onFire: () => void
	): void {
		if (flags.selectionMode) return;
		if (!Number.isFinite(anchorMin)) return;
		this.clearLongPress();
		if (flags.addMode) {
			// Add mode (#047): drag selects immediately — no long-press,
			// grid runs touch-action:none so the drag never scrolls.
			this.rangeSel = null;
			this.selecting = { day, anchorMin, curMin: anchorMin };
			return;
		}
		this.longPressStartY = clientY;
		this.longPressTimer = setTimeout(() => {
			// Long-press selects a default one-hour block; the popover
			// steppers refine it (no gesture fighting with scroll).
			this.suppressClick = true;
			this.rangeSel = null;
			this.selecting = { day, anchorMin, curMin: Math.min(DAY_MINUTES, anchorMin + 60) };
			this.finalize();
			onFire();
		}, this.longPressMs);
	}

	touchMove(clientY: number, minutes: number | null, addMode: boolean): void {
		if (addMode && this.selecting && minutes !== null) {
			this.dragTo(minutes, 2);
			return;
		}
		if (!this.longPressTimer) return;
		// Finger moved before the long-press fired: it's a scroll, not a select.
		if (Math.abs(clientY - this.longPressStartY) > 10) this.clearLongPress();
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
			endMin: Math.min(DAY_MINUTES, Math.max(this.rangeSel.startMin + 15, this.rangeSel.endMin + delta))
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
