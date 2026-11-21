/**
 * Pure lane rules: the day timeline layout (lanes, cluster counts, positions)
 * and the now-line position. Expected values come from the legacy table
 * `src/lib/utils/dayViewLayout.test.ts` and the README Invariants, never from
 * running this code. All instants are UTC with a `Z`, so no host zone can
 * change a position.
 *
 * Doc: ./README.md#day-and-week-views
 */
import { describe, expect, it } from 'vitest';
import {
	CALENDAR_DEFAULT_DURATION_MIN,
	CALENDAR_MINUTES_PER_DAY,
	layoutCalendarDaySlots,
	nowLinePercent,
	type CalendarTimelineRow
} from './calendarPage.lanes.rules';

type Ev = CalendarTimelineRow & { id: string; title: string };

const DAY = '2026-08-28';

/** A UTC event on DAY, from `start` to `end` (end optional). */
function at(startHour: number, startMinute = 0, endHour?: number, endMinute = 0): Ev {
	return {
		id: `e${startHour}-${startMinute}`,
		title: `Event at ${startHour}:${startMinute}`,
		start: `${DAY}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00.000Z`,
		end:
			endHour !== undefined
				? `${DAY}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00.000Z`
				: null
	};
}

describe('layoutCalendarDaySlots', () => {
	it('places a single event at its start position with a default 1h height', () => {
		const [slot] = layoutCalendarDaySlots([at(9)], 'UTC');
		expect(slot.lane).toBe(0);
		expect(slot.lanes).toBe(1);
		expect(slot.topPct).toBeCloseTo(((9 * 60) / 1440) * 100, 5);
		expect(slot.heightPct).toBeCloseTo((60 / 1440) * 100, 5);
		expect(CALENDAR_DEFAULT_DURATION_MIN).toBe(60);
	});

	it('sizes the event from end time when provided', () => {
		const [slot] = layoutCalendarDaySlots([at(9, 0, 11, 30)], 'UTC');
		expect(slot.heightPct).toBeCloseTo((150 / 1440) * 100, 5);
	});

	it('gives overlapping events separate lanes', () => {
		const slots = layoutCalendarDaySlots([at(9, 0, 10), at(9, 30, 11)], 'UTC');
		expect(slots.map((slot) => slot.lane).sort()).toEqual([0, 1]);
		expect(slots.every((slot) => slot.lanes === 2)).toBe(true);
	});

	it('reuses a lane when the previous event has ended', () => {
		const slots = layoutCalendarDaySlots([at(9, 0, 10), at(10)], 'UTC');
		expect(slots.map((slot) => slot.lane)).toEqual([0, 0]);
		expect(slots.every((slot) => slot.lanes === 1)).toBe(true);
	});

	it('packs later events into the first free lane', () => {
		const slots = layoutCalendarDaySlots(
			[at(8, 0, 10, 30), at(9, 30, 10), at(10, 30, 12)],
			'UTC'
		);
		expect(slots.map((slot) => slot.lane)).toEqual([0, 1, 0]);
		// #066 changed only the COUNT, not the packing: the third event starts
		// as the first cluster's run ends, so it is alone in its own cluster.
		expect(slots.map((slot) => slot.lanes)).toEqual([2, 2, 1]);
	});

	it('clamps a late-night event to the day end', () => {
		const overnight = {
			id: 'late',
			title: 'Late',
			start: `${DAY}T23:30:00.000Z`,
			end: '2026-08-29T02:00:00.000Z'
		};
		const [slot] = layoutCalendarDaySlots([overnight], 'UTC');
		expect(slot.heightPct).toBeCloseTo((30 / 1440) * 100, 5);
	});

	it('returns an empty list for no timed events', () => {
		expect(layoutCalendarDaySlots([], 'UTC')).toEqual([]);
	});

	it('returns slots in the caller’s order', () => {
		const slots = layoutCalendarDaySlots([at(19, 0, 20), at(9, 0, 10)], 'UTC');
		expect(slots.map((slot) => slot.row.id)).toEqual(['e19-0', 'e9-0']);
	});
});

// #066 — one day, two unrelated clusters. The lane COUNT used to be the day's
// peak concurrency, so a lone 7pm event rendered at half a column because two
// unrelated events collided at 9am.
describe('layoutCalendarDaySlots sizes each overlap cluster on its own (#066)', () => {
	const lanesOf = (rows: Ev[]) => layoutCalendarDaySlots(rows, 'UTC').map((slot) => slot.lanes);
	const laneOf = (rows: Ev[]) => layoutCalendarDaySlots(rows, 'UTC').map((slot) => slot.lane);

	it('gives a cluster of one the full column even when another cluster collides', () => {
		const rows = [at(9, 0, 10), at(9, 30, 10, 30), at(19, 0, 20)];
		expect(lanesOf(rows)).toEqual([2, 2, 1]);
		expect(laneOf(rows)).toEqual([0, 1, 0]);
	});

	it('splits a cluster of two in half and leaves a third event full width', () => {
		expect(lanesOf([at(9, 0, 10), at(9, 30, 10, 30), at(13, 0, 14)])).toEqual([2, 2, 1]);
	});

	it('sizes mixed clusters independently of each other', () => {
		const rows = [
			at(8, 0, 9),
			at(8, 15, 9, 15),
			at(8, 30, 9, 30),
			at(10, 0, 11),
			at(10, 30, 11, 30),
			at(16, 0, 17)
		];
		expect(lanesOf(rows)).toEqual([3, 3, 3, 2, 2, 1]);
	});

	it('treats a chain of pairwise-overlapping events as ONE cluster', () => {
		const rows = [at(9, 0, 10), at(9, 30, 10, 30), at(10, 15, 11)];
		expect(lanesOf(rows)).toEqual([2, 2, 2]);
		expect(laneOf(rows)).toEqual([0, 1, 0]);
	});

	it('closes a cluster when an event starts exactly as the run ends', () => {
		const rows = [at(8, 0, 10, 30), at(9, 30, 10), at(10, 30, 12)];
		expect(lanesOf(rows)).toEqual([2, 2, 1]);
	});

	it('never shifts a chip outside its own column (hit-testing invariant)', () => {
		const rows = [
			at(7, 0, 8),
			at(9, 0, 11),
			at(9, 10, 11, 10),
			at(9, 20, 11, 20),
			at(9, 30, 10),
			at(12, 0, 13),
			at(19, 0, 23),
			at(22, 0, 23, 30)
		];
		for (const slot of layoutCalendarDaySlots(rows, 'UTC')) {
			expect(slot.lane).toBeLessThan(slot.lanes);
			const rightPct = ((slot.lane + 1) / slot.lanes) * 100;
			expect(rightPct).toBeLessThanOrEqual(100);
		}
	});

	it('leaves an all-day event on the timed path (callers filter the row)', () => {
		const timed = layoutCalendarDaySlots([at(9, 0, 10), at(9, 30, 10, 30)], 'UTC');
		const allDay = layoutCalendarDaySlots(
			[
				{ ...at(9, 0, 10), allDay: true },
				{ ...at(9, 30, 10, 30), allDay: true }
			],
			'UTC'
		);
		expect(allDay.map((slot) => [slot.lane, slot.lanes, slot.topPct, slot.heightPct])).toEqual(
			timed.map((slot) => [slot.lane, slot.lanes, slot.topPct, slot.heightPct])
		);
	});

	it('lays out unsorted input by start time, not by array order', () => {
		const slots = layoutCalendarDaySlots([at(19, 0, 20), at(9, 0, 10), at(9, 30, 10, 30)], 'UTC');
		expect(slots.map((slot) => slot.lanes)).toEqual([1, 2, 2]);
		expect(slots.map((slot) => slot.lane)).toEqual([0, 0, 1]);
	});
});

describe('nowLinePercent', () => {
	it('places the line at the clock time in the viewer’s zone', () => {
		expect(CALENDAR_MINUTES_PER_DAY).toBe(1440);
		expect(nowLinePercent('2026-08-28T00:00:00.000Z', 'UTC')).toBe(0);
		expect(nowLinePercent('2026-08-28T06:00:00.000Z', 'UTC')).toBeCloseTo(25, 5);
		expect(nowLinePercent('2026-08-28T14:30:00.000Z', 'UTC')).toBeCloseTo((870 / 1440) * 100, 5);
	});

	it('converts the instant into the zone the grid draws in', () => {
		// 14:30 UTC is 10:30 in New York (EDT, UTC-4).
		expect(nowLinePercent('2026-08-28T14:30:00.000Z', 'America/New_York')).toBeCloseTo(
			(630 / 1440) * 100,
			5
		);
	});

	it('never paints off the grid for junk input', () => {
		expect(nowLinePercent('not a date', 'UTC')).toBe(0);
		expect(nowLinePercent('', 'UTC')).toBe(0);
	});
});
