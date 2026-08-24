import type { CalendarEvent } from '$lib/server/db/schema';
import { getExceptionsByEventIds } from '$lib/server/db/actions/events';
import { expandRecurrence } from './recurrenceService';

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
