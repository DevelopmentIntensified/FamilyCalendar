/**
 * Pure event geometry: the drag/resize arithmetic, the move and duplicate
 * payloads, the day-overlap rule and the calendar-name match. Ported from
 * `utils/eventMove.ts`, `eventDuplicate.ts`, `dayOverlap.ts` and
 * `calendarMatch.ts`; components keep only the rendering.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';

/** The drag grid step, in minutes. */
export const MOVE_SNAP_MINUTES = 15;

/** Half-open day window semantics for "what's on this day" lists (#285). */
type Instant = Date | string | number;

/** Snap minutes-since-midnight to the grid, clamped to the day. */
export function snapMinutes(minutes: number, step: number = MOVE_SNAP_MINUTES): number {
	return Math.min(24 * 60 - step, Math.max(0, Math.round(minutes / step) * step));
}

/** Day + minutes-since-midnight → DateTime in the day's zone. */
export function minutesToDayTime(day: DateTime, minutes: number): DateTime {
	return day.startOf('day').plus({ minutes: snapMinutes(minutes) });
}

/** Pointer Y within a px-per-hour grid → snapped minutes-since-midnight. */
export function yToMinutes(clientY: number, gridTop: number, pxPerHour: number): number {
	return snapMinutes(((clientY - gridTop) / pxPerHour) * 60);
}

/**
 * Normalize a drag anchor + current pointer into an ordered `[start, end]`
 * minute pair. Degenerate drags become a 30-minute block.
 */
export function normalizeRange(anchorMinutes: number, currentMinutes: number): [number, number] {
	const start = snapMinutes(Math.min(anchorMinutes, currentMinutes));
	let end = snapMinutes(Math.max(anchorMinutes, currentMinutes));
	if (end - start < MOVE_SNAP_MINUTES) end = Math.min(24 * 60, start + 30);
	return [start, end];
}

/** `"2:00 PM – 3:30 PM"` label for a minute range. */
export function formatRangeLabel(startMinutes: number, endMinutes: number): string {
	const format = (minutes: number) => {
		const hour24 = Math.floor(minutes / 60) % 24;
		const minute = minutes % 60;
		const suffix = hour24 < 12 ? 'AM' : 'PM';
		const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
		return `${hour}:${String(minute).padStart(2, '0')} ${suffix}`;
	};
	return `${format(startMinutes)} – ${format(endMinutes)}`;
}

/** Event duration in minutes; 60 when missing, invalid, or non-positive. */
export function eventDurationMinutes(start: string, end?: string | null): number {
	const from = DateTime.fromISO(start);
	const to = end ? DateTime.fromISO(end) : null;
	if (!from.isValid) return 60;
	if (!to || !to.isValid || to <= from) return 60;
	return Math.max(15, Math.round(to.diff(from, 'minutes').minutes));
}

/** The minimal event shape a move or duplicate reads. */
export interface MoveEvent {
	readonly id: string;
	readonly start: string;
	readonly end?: string | null;
	readonly title: string;
	readonly description?: string | null;
	readonly location?: string | null;
	readonly masterId?: string | null;
	readonly recurrenceFrequency?: string | null;
	readonly occurrenceDate?: string | null;
}

export interface MoveTarget {
	readonly day: DateTime;
	readonly minutes: number;
}

export interface MovePayload {
	readonly start: string;
	readonly end: string;
	readonly scope?: 'this';
	readonly occurrenceDate?: string | null;
	readonly title?: string;
	readonly description?: string | null;
	readonly location?: string | null;
	readonly allDay?: boolean;
}

/**
 * Build the move payload for a drop target, preserving duration. A recurring
 * event moves as `scope:'this'` (one occurrence); a one-off moves the master.
 * `occurrenceDate` falls back to the start's date when the expanded occurrence
 * carries none.
 */
export function buildMovePayload(event: MoveEvent, target: MoveTarget): MovePayload {
	const start = minutesToDayTime(target.day, target.minutes);
	const end = start.plus({ minutes: eventDurationMinutes(event.start, event.end) });
	const base = { start: start.toISO() ?? '', end: end.toISO() ?? '' };
	if (event.masterId || event.recurrenceFrequency) {
		return {
			...base,
			scope: 'this',
			occurrenceDate: event.occurrenceDate ?? DateTime.fromISO(event.start).toISODate() ?? null,
			title: event.title,
			description: event.description ?? null,
			location: event.location ?? null,
			allDay: false
		};
	}
	return base;
}

/** The columns duplication copies from the loaded event. */
export interface DuplicateSource {
	readonly title: string;
	readonly start: string | Date;
	readonly end?: string | Date | null;
	readonly description?: string | null;
	readonly location?: string | null;
	readonly allDay?: boolean | null;
	readonly calendarId?: string | null;
	readonly recurrenceFrequency?: string | null;
	readonly recurrenceInterval?: number | null;
	readonly recurrenceByDay?: string[] | null;
	readonly recurrenceCount?: number | null;
	readonly recurrenceUntil?: string | Date | null;
	readonly reminderMinutes?: number | null;
}

export interface DuplicateAttendee {
	readonly userId: string | null;
	readonly inviteType?: string | null;
}

/**
 * The `POST /api/events` body for a duplicate (#039): the title gains the
 * ` (copy)` suffix, and the loaded invitation rows ride along — members with
 * their required/optional type, guests by name (the server stores guests
 * optional).
 */
export function buildDuplicateEventPayload(
	event: DuplicateSource,
	attendees: readonly DuplicateAttendee[],
	nonUserAttendants: readonly string[]
) {
	const attendeePayload = [
		...attendees.flatMap((attendee) =>
			attendee.userId
				? [
						{
							value: attendee.userId,
							isUser: true,
							inviteType: attendee.inviteType === 'required' ? 'required' : 'optional'
						}
					]
				: []
		),
		...nonUserAttendants.map((name) => ({
			value: name,
			isUser: false,
			inviteType: 'optional'
		}))
	];
	const toIsoString = (value: string | Date) => new Date(value).toISOString();
	return {
		title: `${event.title} (copy)`,
		start: toIsoString(event.start),
		end: event.end ? toIsoString(event.end) : null,
		description: event.description || null,
		location: event.location || null,
		allDay: !!event.allDay,
		calendarId: event.calendarId || null,
		recurrenceFrequency: event.recurrenceFrequency,
		recurrenceInterval: event.recurrenceInterval,
		recurrenceByDay: event.recurrenceByDay,
		recurrenceCount: event.recurrenceCount,
		recurrenceUntil: event.recurrenceUntil,
		reminderMinutes: event.reminderMinutes ?? null,
		attendees: attendeePayload
	};
}

/**
 * Whether an event overlaps the half-open viewed day `[dayStart, nextDayStart)`.
 * A real span uses `start < nextDayStart && end > dayStart` (an end exactly at
 * 00:00 belongs to the day before); a point event shows when its start is in
 * the window, so an end-less event at exactly 00:00 still shows.
 */
export function overlapsDay(
	start: Instant,
	end: Instant | null | undefined,
	dayStart: Date,
	nextDayStart: Date
): boolean {
	const from = new Date(start).getTime();
	const low = dayStart.getTime();
	const high = nextDayStart.getTime();
	const to = end == null ? from : new Date(end).getTime();
	if (to <= from) return from >= low && from < high;
	return from < high && to > low;
}

/**
 * Narrow day-split entries to the viewed day: one entry per event. A span that
 * merely ends at that day's 00:00 does not overlap it.
 */
export function pickDayEntries<T extends { readonly date: Date; readonly end: Date | null }>(
	entries: readonly T[],
	dayStart: Date,
	nextDayStart: Date
): T[] {
	const low = dayStart.getTime();
	const high = nextDayStart.getTime();
	return entries.filter((entry) => {
		const day = entry.date.getTime();
		if (day < low || day >= high) return false;
		if (entry.end == null) return true;
		// A span reaching past 00:00, or a zero-length event at `date`.
		return entry.end.getTime() > low || entry.end.getTime() === day;
	});
}

/** Minimal calendar shape for name matching (page + modal share it). */
export interface NamedCalendar {
	readonly id: string;
	readonly name: string;
}

/**
 * Resolve an NLP "on the X calendar" name to a calendar. Exact
 * (case-insensitive) wins; then a partial match in either direction. Null
 * means keep the default and never blocks creation.
 */
export function matchCalendarByName(
	calendars: readonly NamedCalendar[],
	name: string
): NamedCalendar | null {
	const wanted = String(name).toLowerCase();
	return (
		calendars.find((calendar) => calendar.name.toLowerCase() === wanted) ??
		calendars.find(
			(calendar) =>
				calendar.name.toLowerCase().includes(wanted) ||
				wanted.includes(calendar.name.toLowerCase())
		) ??
		null
	);
}
