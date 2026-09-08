import type { CalendarEvent } from '$lib/server/db/schema';
import {
	getExceptionsByEventIds,
	getUserRsvpStatuses,
	getEventAttendanceSummaries,
	getCreatorFirstNames
} from '$lib/server/db/actions/events';
import { expandRecurrence } from './recurrenceService';
import { buildOccurrenceId, normalizeOccurrenceIso } from '$lib/server/utils/eventIds';
import type { RSVPStatus, EventAttendanceSummary } from '$lib/types';

export { parseEvents } from '$lib/utils/eventDisplay';

/**
 * A master row flattened into one displayable occurrence. Occurrence
 * fields carry ISO strings; parseEvents later adds Date instances.
 */
export interface DisplayEvent extends CalendarEvent {
	id: string;
	masterId: string;
	occurrenceDate: string;
	start: string;
	end: string | null;
	title: string;
	description: string | null;
	location: string | null;
	allDay: boolean;
}

const oneDayMs = 24 * 60 * 60 * 1000;

export interface ExpansionWindow {
	start: Date;
	end: Date;
	/** ISO strings for drizzle timestamptz comparisons (mode:'string' rejects Dates). */
	startIso: string;
	endIso: string;
}

const legacyWindow = (): ExpansionWindow => {
	const now = Date.now();
	const start = new Date(now - 2 * 365 * oneDayMs);
	const end = new Date(now + 2 * 365 * oneDayMs);
	return { start, end, startIso: start.toISOString(), endIso: end.toISOString() };
};

/**
 * Visible-month window for the calendar grid (#041): the month containing
 * `dateIso` (or today) plus a full week of padding each side, so adjacent-
 * month cells render under either Sunday- or Monday-first week starts.
 * ~44 days instead of the legacy ±2 years.
 */
export function monthGridWindow(dateIso?: string | null): ExpansionWindow {
	const m = dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? new Date(dateIso) : new Date();
	const base = isNaN(m.getTime()) ? new Date() : m;
	const first = new Date(base.getFullYear(), base.getMonth(), 1);
	const last = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
	const start = new Date(first.getTime() - 7 * oneDayMs);
	const end = new Date(last.getTime() + 7 * oneDayMs);
	return { start, end, startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Expands recurring event masters into virtual occurrences with composite
 * ids (`{masterId}~{occurrenceISO}`), then applies Exception Overrides:
 * cancelled occurrences are dropped, edited ones are merged in place.
 */
export async function expandEventsForUser(
	eventsData: CalendarEvent[],
	window: ExpansionWindow = legacyWindow()
): Promise<DisplayEvent[]> {
	const exceptions = await getExceptionsByEventIds(eventsData.map((e) => e.id));

	const exceptionByKey = new Map(
		exceptions.map((x) => [
			buildOccurrenceId(
				x.eventId,
				normalizeOccurrenceIso(x.originalDate) ?? new Date(x.originalDate).toISOString()
			),
			x
		])
	);

	const windowStart = window.start;
	const windowEnd = window.end;

	const result: DisplayEvent[] = [];
	for (const e of eventsData) {
		const occurrences = expandRecurrence(e, windowStart, windowEnd);
		if (occurrences.length === 0) continue;

		const durationMs = e.end ? new Date(e.end).getTime() - new Date(e.start).getTime() : null;

		for (const occ of occurrences) {
			const occIso = occ.toISOString();
			const exception = exceptionByKey.get(buildOccurrenceId(e.id, occIso));
			if (exception?.isCancelled) continue;

			// Start/end overrides shift the occurrence itself; without an
			// override, start stays on the recurrence slot and end derives
			// from master duration. Composite id/occurrenceDate keep keying
			// off the original recurrence slot.
			const effectiveStart = exception?.start != null ? new Date(exception.start) : occ;
			const effectiveEnd =
				exception?.end != null
					? new Date(exception.end)
					: durationMs !== null
						? new Date(effectiveStart.getTime() + durationMs)
						: null;
			result.push({
				...e,
				id: buildOccurrenceId(e.id, occIso),
				masterId: e.id,
				occurrenceDate: occIso,
				start: effectiveStart.toISOString(),
				end: effectiveEnd ? effectiveEnd.toISOString() : null,
				title: exception?.title ?? e.title,
				description: exception?.description ?? e.description,
				location: exception?.location ?? e.location,
				allDay: exception?.allDay ?? e.allDay
			});
		}
	}
	return result;
}

/**
 * Attaches the current user's RSVP status to each displayable occurrence.
 * Attendance is stored per master event, so every occurrence sharing a
 * masterId carries the same status.
 */
export async function attachRsvpStatus<T extends { masterId: string }>(
	userId: string,
	list: T[]
): Promise<Array<T & { rsvpStatus?: RSVPStatus }>> {
	const rows = await getUserRsvpStatuses(userId, [...new Set(list.map((e) => e.masterId))]);
	// SAFETY: rsvp.status is a DB enum constrained to the RSVPStatus vocabulary.
	const statusById = new Map(rows.map((r) => [r.eventId, r.status as RSVPStatus]));
	return list.map((e) => ({ ...e, rsvpStatus: statusById.get(e.masterId) }));
}

/**
 * Attaches a compact "who's going" summary (per master event) to each
 * displayable occurrence, so calendar chips and dashboard rows can show
 * family attendance at a glance. Attendance is stored per master, so all
 * occurrences of a series share the same summary.
 */
export async function attachAttendanceSummaries<T extends { masterId: string }>(
	list: T[]
): Promise<Array<T & { attendance?: EventAttendanceSummary }>> {
	if (list.length === 0) return [...list];
	const masterIds = [...new Set(list.map((e) => e.masterId))];
	const summaries = await getEventAttendanceSummaries(masterIds);
	const summaryById = (eventId: string) => {
		const s = summaries.get(eventId);
		return s && s.invited > 0 ? s : undefined;
	};
	return list.map((e) => ({ ...e, attendance: summaryById(e.masterId) }));
}

/**
 * Attaches the creator's first name to each displayable occurrence (keyed on
 * the master's ownerId) so family-event chips and modals can show who created
 * the event. One users lookup for the whole set — no N+1.
 */
export async function attachCreatorNames<T extends { ownerId: string }>(
	list: T[]
): Promise<Array<T & { creatorName?: string }>> {
	if (list.length === 0) return [...list];
	const names = await getCreatorFirstNames([...new Set(list.map((e) => e.ownerId))]);
	return list.map((e) => ({ ...e, creatorName: names.get(e.ownerId) }));
}
