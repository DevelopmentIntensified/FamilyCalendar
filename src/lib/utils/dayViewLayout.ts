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

/** Greedy lane layout for a day's timed events.
 *
 * Each event occupies the first lane whose previous event ended by its start
 * time; overlapping events are split into equal-width lanes. Positions are
 * returned as percentages of the day (0-100) so any pixel scale can render
 * them. Mirrors the calendar DayView's long-standing behavior, extracted so
 * the dashboard's compact day timeline shares one source of truth.
 */
export function layoutTimed<T extends TimelineEventInput>(
	list: T[]
): LaidOutEvent<T>[] {
	const laneEnds: number[] = [];
	const out: Omit<LaidOutEvent<T>, 'lanes'>[] = [];
	for (const event of list) {
		const s = toDate(event.start);
		const startMin = s.getHours() * 60 + s.getMinutes();
		let endMin = startMin + DEFAULT_DURATION_MIN;
		if (event.end) {
			const e2 = toDate(event.end);
			endMin = Math.max(endMin, e2.getHours() * 60 + e2.getMinutes());
		}
		let lane = laneEnds.findIndex((t) => startMin >= t);
		if (lane === -1) lane = laneEnds.length;
		laneEnds[lane] = endMin;
		out.push({
			event,
			lane,
			topPct: (startMin / MINUTES_PER_DAY) * 100,
			heightPct:
				(Math.min(endMin - startMin, MINUTES_PER_DAY - startMin) / MINUTES_PER_DAY) * 100
		});
	}
	const lanes = Math.max(laneEnds.length, 1);
	return out.map((o) => ({ ...o, lanes }));
}

/** Vertical position (% of the day) of the current time — drives the now-line. */
export function nowPositionPct(): number {
	const d = new Date();
	return ((d.getHours() * 60 + d.getMinutes()) / MINUTES_PER_DAY) * 100;
}