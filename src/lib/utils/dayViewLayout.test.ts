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
		expect(slot.topPct).toBeCloseTo(((9 * 60) / 1440) * 100, 5);
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
		// #066 changed only the COUNT, not the packing: the third event starts
		// as the first cluster's run ends, so it is alone in its own cluster
		// and takes the full column. It used to read `2` — the day's peak.
		expect(slots.map((s) => s.lanes)).toEqual([2, 2, 1]);
	});

	it('clamps a late-night event to the day end', () => {
		const [slot] = layoutTimed([at(23, 30, 26)]);
		expect(slot.heightPct).toBeCloseTo((30 / 1440) * 100, 5);
	});

	it('returns an empty list for no timed events', () => {
		expect(layoutTimed([])).toEqual([]);
	});
});

// #066 — the review's complaint: "events are only shifted if they overlap with
// other events". One day, two unrelated clusters. The lane COUNT used to be the
// day's peak concurrency, so a lone 7pm event rendered at half a column
// because two unrelated events collided at 9am.
describe('layoutTimed sizes each overlap cluster on its own (#066)', () => {
	const lanesOf = (list: Ev[]) => layoutTimed(list).map((s) => s.lanes);
	const laneOf = (list: Ev[]) => layoutTimed(list).map((s) => s.lane);

	it('gives a cluster of one the full column even when another cluster collides', () => {
		const list = [
			at(9, 0, 10), // 9:00–10:00  cluster A
			at(9, 30, 10, 30), // 9:30–10:30  cluster A (overlaps)
			at(19, 0, 20) // 19:00–20:00 cluster B (lone)
		];
		expect(lanesOf(list)).toEqual([2, 2, 1]);
		// The lone event is not shifted either — it takes lane 0.
		expect(laneOf(list)).toEqual([0, 1, 0]);
	});

	it('splits a cluster of two in half and leaves a third event full width', () => {
		const list = [at(9, 0, 10), at(9, 30, 10, 30), at(13, 0, 14)];
		expect(lanesOf(list)).toEqual([2, 2, 1]);
	});

	it('sizes mixed clusters independently of each other', () => {
		// Cluster A peaks at 3; cluster B peaks at 2; cluster C is alone.
		const list = [
			at(8, 0, 9), // A
			at(8, 15, 9, 15), // A
			at(8, 30, 9, 30), // A
			at(10, 0, 11), // B
			at(10, 30, 11, 30), // B
			at(16, 0, 17) // C
		];
		expect(lanesOf(list)).toEqual([3, 3, 3, 2, 2, 1]);
	});

	it('treats a chain of pairwise-overlapping events as ONE cluster', () => {
		// A∩B overlap, B∩C overlap, A and C do not — but the run is one
		// cluster, so all three share its peak of 2.
		const list = [at(9, 0, 10), at(9, 30, 10, 30), at(10, 15, 11)];
		expect(lanesOf(list)).toEqual([2, 2, 2]);
		expect(laneOf(list)).toEqual([0, 1, 0]);
	});

	it('closes a cluster when an event starts exactly as the run ends', () => {
		// Half-open intervals: 8:00–10:30 and 10:30–12:00 do not overlap.
		const list = [at(8, 0, 10, 30), at(9, 30, 10), at(10, 30, 12)];
		expect(lanesOf(list)).toEqual([2, 2, 1]);
	});

	it('never shifts a chip outside its own column (hit-testing invariant)', () => {
		// left = lane/lanes, width = 1/lanes. A slot whose lane index reached
		// or passed its lane count would render past the column edge and
		// swallow the neighbouring day's clicks.
		const list = [
			at(7, 0, 8),
			at(9, 0, 11),
			at(9, 10, 11, 10),
			at(9, 20, 11, 20),
			at(9, 30, 10),
			at(12, 0, 13),
			at(19, 0, 23),
			at(22, 0, 23, 30)
		];
		for (const slot of layoutTimed(list)) {
			expect(slot.lane).toBeLessThan(slot.lanes);
			const rightPct = ((slot.lane + 1) / slot.lanes) * 100;
			expect(rightPct).toBeLessThanOrEqual(100);
		}
	});

	it('leaves an all-day event on the timed path (callers filter the row)', () => {
		// The all-day row is a different component; the util does not branch on
		// the flag, so an all-day input must lay out exactly like a timed one.
		const timed = layoutTimed([at(9, 0, 10), at(9, 30, 10, 30)]);
		const allDay = layoutTimed([
			{ ...at(9, 0, 10), allDay: true },
			{ ...at(9, 30, 10, 30), allDay: true }
		]);
		expect(allDay.map((s) => [s.lane, s.lanes, s.topPct, s.heightPct])).toEqual(
			timed.map((s) => [s.lane, s.lanes, s.topPct, s.heightPct])
		);
	});

	it('lays out unsorted input by start time, not by array order', () => {
		// 19:00 arrives before 9:00; positions must still be by clock time.
		const slots = layoutTimed([at(19, 0, 20), at(9, 0, 10), at(9, 30, 10, 30)]);
		expect(slots.map((s) => s.lanes)).toEqual([1, 2, 2]);
		expect(slots.map((s) => s.lane)).toEqual([0, 0, 1]);
	});
});

describe('nowPositionPct', () => {
	it('returns a value in the valid day range', () => {
		const v = nowPositionPct();
		expect(v).toBeGreaterThanOrEqual(0);
		expect(v).toBeLessThanOrEqual(100);
	});
});
