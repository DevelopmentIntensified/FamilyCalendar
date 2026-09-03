import { DateTime } from 'luxon';
import type { Event } from '$lib/types';

export const MOVE_SNAP_MINUTES = 15;

type MoveEvent = Pick<
	Event,
	| 'id'
	| 'start'
	| 'end'
	| 'title'
	| 'description'
	| 'location'
	| 'masterId'
	| 'recurrenceFrequency'
	| 'occurrenceDate'
>;

export interface MoveTarget {
	day: DateTime;
	minutes: number;
}

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

/** Event duration in minutes; 60 when missing, invalid, or non-positive. */
export function eventDurationMinutes(start: string, end?: string | null): number {
	const s = DateTime.fromISO(start);
	const e = end ? DateTime.fromISO(end) : null;
	if (!s.isValid) return 60;
	if (!e || !e.isValid || e <= s) return 60;
	return Math.max(15, Math.round(e.diff(s, 'minutes').minutes));
}

export interface MovePayload {
	start: string | null;
	end: string | null;
	scope?: 'this';
	occurrenceDate?: string | null;
	title?: string;
	description?: string | null;
	location?: string | null;
	allDay?: boolean;
}

/**
 * Build the move payload for a drop target, preserving duration.
 * Recurring events move as scope:'this' (single occurrence); one-offs
 * move the master. occurrenceDate falls back to the start date when the
 * expanded occurrence carries none.
 */
export function buildMovePayload(event: MoveEvent, target: MoveTarget): MovePayload {
	const start = minutesToDayTime(target.day, target.minutes);
	const end = start.plus({ minutes: eventDurationMinutes(event.start, event.end) });
	const base: MovePayload = { start: start.toISO(), end: end.toISO() };
	if (event.masterId || event.recurrenceFrequency) {
		return {
			...base,
			scope: 'this',
			occurrenceDate:
				event.occurrenceDate ?? DateTime.fromISO(event.start).toISODate() ?? null,
			title: event.title,
			description: event.description ?? null,
			location: event.location ?? null,
			allDay: false
		};
	}
	return base;
}
