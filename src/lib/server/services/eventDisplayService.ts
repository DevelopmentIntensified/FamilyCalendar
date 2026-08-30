import type { CalendarEvent } from '$lib/server/db/schema';
import { getExceptionsByEventIds, getUserRsvpStatuses, getEventAttendanceSummaries } from '$lib/server/db/actions/events';
import { expandRecurrence } from './recurrenceService';
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

/**
 * Expands recurring event masters into virtual occurrences with composite
 * ids (`{masterId}~{occurrenceISO}`), then applies Exception Overrides:
 * cancelled occurrences are dropped, edited ones are merged in place.
 */
export async function expandEventsForUser(eventsData: CalendarEvent[]): Promise<DisplayEvent[]> {
	const exceptions = await getExceptionsByEventIds(eventsData.map((e) => e.id));

	const exceptionByKey = new Map(
		exceptions.map((x) => [`${x.eventId}~${new Date(x.originalDate).toISOString()}`, x])
	);

	const now = Date.now();
	const windowStart = new Date(now - 2 * 365 * oneDayMs);
	const windowEnd = new Date(now + 2 * 365 * oneDayMs);

	const result: DisplayEvent[] = [];
	for (const e of eventsData) {
		const occurrences = expandRecurrence(e, windowStart, windowEnd);
		if (occurrences.length === 0) continue;

		const durationMs = e.end ? new Date(e.end).getTime() - new Date(e.start).getTime() : null;

		for (const occ of occurrences) {
			const occIso = occ.toISOString();
			const exception = exceptionByKey.get(`${e.id}~${occIso}`);
			if (exception?.isCancelled) continue;

			// Start/end overrides shift the occurrence itself; without an
			// override, start stays on the recurrence slot and end derives
			// from master duration. Composite id/occurrenceDate keep keying
			// off the original recurrence slot.
			const effectiveStart =
				exception?.start != null ? new Date(exception.start) : occ;
			const effectiveEnd =
				exception?.end != null
					? new Date(exception.end)
					: durationMs !== null
						? new Date(effectiveStart.getTime() + durationMs)
						: null;
			result.push({
				...e,
				id: `${e.id}~${occIso}`,
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
	const rows = await getUserRsvpStatuses(
		userId,
		[...new Set(list.map((e) => e.masterId))]
	);
	const statusById = new Map(
		rows.map((r) => [r.eventId, r.status as RSVPStatus])
	);
	return list.map((e) => ({ ...e, rsvpStatus: statusById.get(e.masterId) }));
}

/**
 * Attaches a compact "who's going" summary (per master event) to each
 * displayable occurrence, so calendar chips and dashboard rows can show
 * family attendance at a glance. Attendance is stored per master, so all
 * occurrences of a series share the same summary.
 */
export async function attachAttendanceSummaries<
	T extends { masterId: string }
>(list: T[]): Promise<Array<T & { attendance?: EventAttendanceSummary }>> {
	if (list.length === 0) return [...list];
	const masterIds = [...new Set(list.map((e) => e.masterId))];
	const summaries = await getEventAttendanceSummaries(masterIds);
	const summaryById = (eventId: string) => {
		const s = summaries.get(eventId);
		return s && s.invited > 0 ? s : undefined;
	};
	return list.map((e) => ({ ...e, attendance: summaryById(e.masterId) }));
}
