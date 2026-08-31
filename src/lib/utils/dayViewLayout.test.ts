import { describe, it, expect } from 'vitest';
import {
	layoutTimed,
	nowPositionPct,
	DEFAULT_DURATION_MIN,
	type TimelineEventInput
} from './dayViewLayout';

type Ev = TimelineEventInput & { title: string };

// 09:00 in local tz on a fixed date.
function at(hour: number, minute = 0, endHour?: number, endMinute = 0): Ev {
	return {
		id: `e${hour}-${minute}`,
		title: `Event at ${hour}:${minute}`,
		start: new Date(2026, 7, 28, hour, minute),
		end: endHour !== undefined ? new Date(2026, 7, 28, endHour, endMinute) : null
	};
}

describe('layoutTimed', () => {
	it('places a single event at its start position with a default 1h height', () => {
		const [slot] = layoutTimed([at(9)]);
		expect(slot.lane).toBe(0);
		expect(slot.lanes).toBe(1);
		expect(slot.topPct).toBeCloseTo((9 * 60 / 1440) * 100, 5);
		expect(slot.heightPct).toBeCloseTo((60 / 1440) * 100, 5);
		expect(DEFAULT_DURATION_MIN).toBe(60);
	});

	it('sizes the event from end time when provided', () => {
		const [slot] = layoutTimed([at(9, 0, 11, 30)]);
		expect(slot.heightPct).toBeCloseTo((150 / 1440) * 100, 5);
	});

	it('gives overlapping events separate lanes', () => {
		const slots = layoutTimed([at(9, 0, 10), at(9, 30, 11)]);
		expect(slots.map((s) => s.lane).sort()).toEqual([0, 1]);
		expect(slots.every((s) => s.lanes === 2)).toBe(true);
	});

	it('reuses a lane when the previous event has ended', () => {
		const slots = layoutTimed([at(9, 0, 10), at(10)]);
		expect(slots.map((s) => s.lane)).toEqual([0, 0]);
		expect(slots.every((s) => s.lanes === 1)).toBe(true);
	});

	it('packs later events into the first free lane', () => {
		const slots = layoutTimed([
			at(8, 0, 10, 30), // 8:00–10:30 → lane 0
			at(9, 30, 10), // overlaps lane 0 → lane 1
			at(10, 30, 12) // starts exactly when lane 0 frees → back to lane 0
		]);
		expect(slots.map((s) => s.lane)).toEqual([0, 1, 0]);
		expect(slots.every((s) => s.lanes === 2)).toBe(true);
	});

	it('clamps a late-night event to the day end', () => {
		const [slot] = layoutTimed([at(23, 30, 26)]);
		expect(slot.heightPct).toBeCloseTo((30 / 1440) * 100, 5);
	});

	it('returns an empty list for no timed events', () => {
		expect(layoutTimed([])).toEqual([]);
	});
});

describe('nowPositionPct', () => {
	it('returns a value in the valid day range', () => {
		const v = nowPositionPct();
		expect(v).toBeGreaterThanOrEqual(0);
		expect(v).toBeLessThanOrEqual(100);
	});
});