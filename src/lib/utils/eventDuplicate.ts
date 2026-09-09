import { toDate } from '$lib/utils/eventTime';

/** Payload builder for event duplication (#039, extracted from EventModal). */

interface DuplicateSource {
	title: string;
	start: string | Date;
	end?: string | Date | null;
	description?: string | null;
	location?: string | null;
	allDay?: boolean | null;
	calendarId?: string | null;
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
	recurrenceByDay?: string[] | null;
	recurrenceCount?: number | null;
	recurrenceUntil?: string | Date | null;
	reminderMinutes?: number | null;
}

interface DuplicateAttendee {
	userId: string | null;
	inviteType?: string | null;
}

export function buildDuplicateEventPayload(
	event: DuplicateSource,
	attendees: DuplicateAttendee[],
	nonUserAttendants: string[]
) {
	// Copy the loaded invitation rows too: members with their required/
	// optional type, guests by name (server always stores guests optional).
	const attendeePayload = [
		...attendees.flatMap((a) =>
			a.userId
				? [
						{
							value: a.userId,
							isUser: true,
							inviteType: a.inviteType === 'required' ? 'required' : 'optional'
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
	const toIsoString = (v: string | Date) => toDate(v).toISOString();
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
