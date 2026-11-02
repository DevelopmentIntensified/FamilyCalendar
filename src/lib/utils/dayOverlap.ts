/**
 * Day-overlap rule for "what's on this day" lists (#285).
 *
 * The viewed day is the half-open window [dayStart, nextDayStart) in the
 * user's zone. An event with a real span shows when
 * `start < nextDayStart && end > dayStart` — end is exclusive, so an event
 * ending exactly at 00:00 belongs to the day before, not this one. A point
 * event (no end, or end <= start) shows when its start falls inside the
 * window, so an end-less event at exactly 00:00 still shows on that day.
 * All-day events follow the same rule on their stored instants.
 */

type Instant = Date | string | number;

const ms = (v: Instant) => new Date(v).getTime();

export function overlapsDay(
	start: Instant,
	end: Instant | null | undefined,
	dayStart: Date,
	nextDayStart: Date
): boolean {
	const s = ms(start);
	const lo = dayStart.getTime();
	const hi = nextDayStart.getTime();
	const e = end == null ? s : ms(end);
	if (e <= s) return s >= lo && s < hi;
	return s < hi && e > lo;
}

/**
 * Narrow `parseEvents` output to the viewed day: one entry per event.
 * `parseEvents` splits a multi-day event into one entry per local day it
 * touches (its `date`), so the entry bucketed on the viewed day is the one
 * to keep — unless the event merely ends at that day's 00:00, in which case
 * it does not overlap the day (see `overlapsDay`). Split entries carry a
 * synthetic `start` (= `date`), so the end check is done here directly.
 */
export function pickDayEntries<T extends { date: Date; end: Date | null }>(
	entries: T[],
	dayStart: Date,
	nextDayStart: Date
): T[] {
	const lo = dayStart.getTime();
	const hi = nextDayStart.getTime();
	return entries.filter((e) => {
		const d = e.date.getTime();
		if (d < lo || d >= hi) return false;
		if (e.end == null) return true;
		const end = e.end.getTime();
		// A span that reaches past 00:00, or a zero-length event at `date`.
		return end > lo || end === d;
	});
}
