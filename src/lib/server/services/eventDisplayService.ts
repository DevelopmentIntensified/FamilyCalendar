import type { CalendarEvent } from '$lib/server/db/schema';
import { getExceptionsByEventIds } from '$lib/server/db/actions/events';
import { expandRecurrence } from './recurrenceService';

const oneDayMs = 24 * 60 * 60 * 1000;

function deriveEventProps(e: Record<string, any>, date: Date, end: Date | null) {
	return {
		...e,
		start: date,
		end: end || e.end,
		date
	};
}

export function parseEvents(eventsData: Record<string, any>[]) {
	return eventsData.flatMap((e) => {
		const startDate = new Date(e.start);
		const endDate = e.end ? new Date(e.end) : null;

		if (!endDate || startDate.getDate() === endDate.getDate()) {
			return deriveEventProps(e, startDate, endDate);
		}

		const diffDays = Math.round(Math.abs((startDate.getTime() - endDate.getTime()) / oneDayMs));
		const days = [];

		for (let i = 0; i <= diffDays; i++) {
			days.push(deriveEventProps(e, new Date(startDate.getTime() + oneDayMs * i), endDate));
		}

		return days;
	});
}

/**
 * Expands recurring event masters into virtual occurrences with composite
 * ids (`{masterId}~{occurrenceISO}`), then applies Exception Overrides:
 * cancelled occurrences are dropped, edited ones are merged in place.
 */
export async function expandEventsForUser(eventsData: CalendarEvent[]) {
	const exceptions = await getExceptionsByEventIds(eventsData.map((e) => e.id));

	const exceptionByKey = new Map(
		exceptions.map((x) => [`${x.eventId}~${new Date(x.originalDate).toISOString()}`, x])
	);

	const now = Date.now();
	const windowStart = new Date(now - 2 * 365 * oneDayMs);
	const windowEnd = new Date(now + 2 * 365 * oneDayMs);

	const result: Record<string, any>[] = [];
	for (const e of eventsData) {
		const occurrences = expandRecurrence(e, windowStart, windowEnd);
		if (occurrences.length === 0) continue;

		const durationMs = e.end ? new Date(e.end).getTime() - new Date(e.start).getTime() : null;

		for (const occ of occurrences) {
			const occIso = occ.toISOString();
			const exception = exceptionByKey.get(`${e.id}~${occIso}`);
			if (exception?.isCancelled) continue;

			const occEnd = durationMs !== null ? new Date(occ.getTime() + durationMs) : null;
			result.push({
				...e,
				id: `${e.id}~${occIso}`,
				masterId: e.id,
				occurrenceDate: occIso,
				start: occ.toISOString(),
				end: occEnd ? occEnd.toISOString() : null,
				title: exception?.title ?? e.title,
				description: exception?.description ?? e.description,
				location: exception?.location ?? e.location,
				allDay: exception?.allDay ?? e.allDay
			});
		}
	}
	return result;
}
