/**
 * The event detail page's first-paint slice of the detail region's rules: the
 * day an event prints on, the attendance buckets and the two row shapes they
 * read. `calendar.eventView.rules` re-exports all of it, so every other caller
 * keeps its import.
 *
 * Its own file, not part of `calendar.eventView.rules`, for ADR 0010: Rollup
 * ships a module's used exports as one chunk, and `/calendar/event/[id]` must
 * not download the series, duplicate, label and colour helpers of the whole
 * detail region to show a date and three buckets.
 *
 * Doc: ./README.md#invariants
 */

/** One attendance row: a member when `userId` is set, otherwise a guest name. */
export interface CalendarAttendanceRow {
	readonly userId: string | null;
	readonly status: string | null;
	readonly firstName?: string | null;
	readonly lastName?: string | null;
	readonly name?: string | null;
	readonly inviteType?: string | null;
}

export interface CalendarAttendanceSplit {
	readonly going: CalendarAttendanceRow[];
	readonly maybe: CalendarAttendanceRow[];
	readonly notGoing: CalendarAttendanceRow[];
	readonly undecided: CalendarAttendanceRow[];
}

/** The two fields the printed day reads from an event view. */
export interface CalendarEventDayInput {
	readonly start: string | Date;
	readonly date?: string | Date | null;
}

/** The legacy `toDate`: a Date passes through, a string is parsed. */
export function calendarAsDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const parsed = value instanceof Date ? value : new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The day the detail region prints: `date` when the row was split onto one. */
export function calendarEventDay(event: CalendarEventDayInput): Date | undefined {
	if (event.date) return calendarAsDate(event.date) ?? undefined;
	return calendarAsDate(event.start) ?? undefined;
}

/** Bucket attendance rows; an unknown status counts as undecided (#039). */
export function calendarAttendanceSplit(
	rows: readonly CalendarAttendanceRow[]
): CalendarAttendanceSplit {
	const split: {
		going: CalendarAttendanceRow[];
		maybe: CalendarAttendanceRow[];
		notGoing: CalendarAttendanceRow[];
		undecided: CalendarAttendanceRow[];
	} = { going: [], maybe: [], notGoing: [], undecided: [] };
	for (const row of rows) {
		if (row.status === 'going') split.going.push(row);
		else if (row.status === 'maybe') split.maybe.push(row);
		else if (row.status === 'declined' || row.status === 'not_going') split.notGoing.push(row);
		else split.undecided.push(row);
	}
	return split;
}
