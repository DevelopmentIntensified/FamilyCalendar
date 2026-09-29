import { toDate } from '$lib/utils/eventTime';

/** Events starting on a non-timed shape that the calendar lane layout works on. */
export interface TimelineEventInput {
	id: string;
	title: string;
	start: Date | string;
	end?: Date | string | null;
	allDay?: boolean;
}

export interface LaidOutEvent<T extends TimelineEventInput> {
	event: T;
	lane: number;
	lanes: number;
	topPct: number;
	heightPct: number;
}

export const MINUTES_PER_DAY = 1440;
export const DEFAULT_DURATION_MIN = 60;

/** An event's slot on the day timeline, in minutes from midnight. */
function spanMin(event: TimelineEventInput): { startMin: number; endMin: number } {
	const s = toDate(event.start);
	const startMin = s.getHours() * 60 + s.getMinutes();
	let endMin = startMin + DEFAULT_DURATION_MIN;
	if (event.end) {
		const e2 = toDate(event.end);
		endMin = Math.max(endMin, e2.getHours() * 60 + e2.getMinutes());
	}
	return { startMin, endMin };
}

/** Greedy lane layout for a day's timed events.
 *
 * Each event occupies the first lane whose previous event ended by its start
 * time. Positions are returned as percentages of the day (0-100) so any pixel
 * scale can render them. Mirrors the calendar DayView's long-standing
 * behavior, extracted so the day grid, the week grid and the dashboard's
 * compact day timeline share one source of truth.
 *
 * **Lane count is per overlap cluster, not per day (#066).** A cluster is a
 * maximal run of events joined by pairwise overlap (transitive: A∩B and B∩C
 * put all three in one run even when A and C are hours apart). Every member of
 * a cluster is split into `peak concurrency of that cluster` equal lanes, so a
 * cluster of one keeps the full column instead of being squeezed by an
 * unrelated collision elsewhere in the day. `lane` is still 0-based within the
 * cluster, which keeps `lane < lanes` — and therefore the chip's right edge —
 * inside its own column, so drag-to-create and range-select still hit the day
 * the pointer is over.
 */
export function layoutTimed<T extends TimelineEventInput>(list: T[]): LaidOutEvent<T>[] {
	const spans = list.map(spanMin);
	// Start-time order, stable: both the lane pass and the cluster sweep read
	// the day as a timeline, so a caller that hands over unsorted rows still
	// gets positions by clock time. Results come back in the caller's order.
	const order = spans.map((span, i) => ({ span, i })).sort((a, b) => a.span.startMin - b.span.startMin);

	const laneEnds: number[] = [];
	const laneOf: number[] = new Array(list.length);
	const lanesOf: number[] = new Array(list.length);
	// `runEnd` is the latest end in the open cluster; an event starting at or
	// after it opens a new one (intervals are half-open, so a 10:30 start does
	// not overlap a 10:30 finish).
	let runFrom = 0;
	let runEnd = -1;
	let runLanes = 0;
	for (let k = 0; k < order.length; k++) {
		const { span, i } = order[k];
		if (k > 0 && span.startMin >= runEnd) {
			for (let j = runFrom; j < k; j++) lanesOf[order[j].i] = runLanes;
			runFrom = k;
			runLanes = 0;
		}
		runEnd = Math.max(runEnd, span.endMin);

		let lane = laneEnds.findIndex((t) => span.startMin >= t);
		if (lane === -1) lane = laneEnds.length;
		laneEnds[lane] = span.endMin;
		laneOf[i] = lane;
		// Lane indices inside a cluster are contiguous from 0 (its first event
		// always finds lane 0 free), so the highest index is the cluster's peak.
		runLanes = Math.max(runLanes, lane + 1);
	}
	for (let j = runFrom; j < order.length; j++) lanesOf[order[j].i] = runLanes;

	return list.map((event, i) => {
		const { startMin, endMin } = spans[i];
		return {
			event,
			lane: laneOf[i],
			lanes: lanesOf[i],
			topPct: (startMin / MINUTES_PER_DAY) * 100,
			heightPct: (Math.min(endMin - startMin, MINUTES_PER_DAY - startMin) / MINUTES_PER_DAY) * 100
		};
	});
}

/** Vertical position (% of the day) of the current time — drives the now-line. */
export function nowPositionPct(): number {
	const d = new Date();
	return ((d.getHours() * 60 + d.getMinutes()) / MINUTES_PER_DAY) * 100;
}
