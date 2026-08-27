import { db } from '$lib/server/db';
import { eventAttendance, eventExceptions, events, users, type CalendarEvent } from '$lib/server/db/schema';
import { eq, and, sql, inArray, or } from 'drizzle-orm';
import { getAccessibleCalendarIds, eventAccessFilter } from '$lib/server/utils/calendarScope';
import { toDateTime } from '$lib/server/utils/eventTimes';

export async function getEvent(id: string) {
	const [event] = await db.select().from(events).where(eq(events.id, id));
	return event;
}

export async function getExceptionsByEventIds(eventIds: string[]) {
	if (eventIds.length === 0) return [];
	return await db.select().from(eventExceptions).where(inArray(eventExceptions.eventId, eventIds));
}

export async function findException(eventId: string, originalDateIso: string) {
	// timestamptz equality only matches when the string renders exactly like
	// Postgres would; normalize any ISO-ish input to UTC ISO first.
	const originalDate = toDateTime(originalDateIso)?.toUTC().toISO() ?? originalDateIso;
	const [exception] = await db
		.select()
		.from(eventExceptions)
		.where(and(eq(eventExceptions.eventId, eventId), eq(eventExceptions.originalDate, originalDate)));
	return exception;
}

export async function upsertException(data: {
	eventId: string;
	originalDate: string;
	isCancelled?: boolean;
	title?: string | null;
	description?: string | null;
	location?: string | null;
	start?: string | null;
	end?: string | null;
	allDay?: boolean | null;
}) {
	// Select-then-write is racy without a unique index on (event_id, original_date):
	// two concurrent edits can both miss the select and insert duplicates.
	// Once that unique index exists this can become a single
	// insert(...).onConflictDoUpdate({ target: [eventId, originalDate] }).
	const originalDate = toDateTime(data.originalDate)?.toUTC().toISO() ?? data.originalDate;
	const existing = await findException(data.eventId, originalDate);
	if (existing) {
		const [updated] = await db
			.update(eventExceptions)
			.set({
				isCancelled: data.isCancelled ?? existing.isCancelled,
				title: data.title !== undefined ? data.title : existing.title,
				description: data.description !== undefined ? data.description : existing.description,
				location: data.location !== undefined ? data.location : existing.location,
				start: data.start !== undefined ? data.start : existing.start,
				end: data.end !== undefined ? data.end : existing.end,
				allDay: data.allDay !== undefined ? data.allDay : existing.allDay
			})
			.where(eq(eventExceptions.id, existing.id))
			.returning();
		return updated;
	}
	const [created] = await db
		.insert(eventExceptions)
		.values({
			eventId: data.eventId,
			originalDate,
			isCancelled: data.isCancelled ?? false,
			title: data.title ?? null,
			description: data.description ?? null,
			location: data.location ?? null,
			start: data.start ?? null,
			end: data.end ?? null,
			allDay: data.allDay ?? null
		})
		.returning();
	return created;
}

export async function getEventAttendance(id: string) {
	return await db
		.select({
			id: eventAttendance.id,
			eventId: eventAttendance.eventId,
			userId: eventAttendance.userId,
			name: eventAttendance.name,
			status: eventAttendance.status,
			firstName: users.firstName,
			lastName: users.lastName
		})
		.from(eventAttendance)
		.leftJoin(users, eq(eventAttendance.userId, users.id))
		.where(eq(eventAttendance.eventId, id));
}

export async function addEventAttendants(eventId: string, names: string[]) {
	if (names.length === 0) return;
	const insertData = names.map(name => ({
		eventId,
		name,
		status: 'undecided' as const
	}));
	await db.insert(eventAttendance).values(insertData);
}

export async function syncEventAttendants(eventId: string, names: string[]) {
	// Delete existing non-user attendants
	await db.delete(eventAttendance)
		.where(and(eq(eventAttendance.eventId, eventId), sql`${eventAttendance.name} IS NOT NULL`));
	// Re-insert provided names
	if (names.length > 0) {
		await addEventAttendants(eventId, names);
	}
}

export async function createEvent(data: Omit<CalendarEvent, 'id' | 'created_at'>, ownerId: string, attendantNames?: string[]) {
	const [createdEvent] = await db.insert(events).values(data).returning();
	// Auto-RSVP creator as "going"
	if (createdEvent && ownerId) {
		await db.insert(eventAttendance).values({
			eventId: createdEvent.id,
			userId: ownerId,
			status: 'going'
		});
	}
	// Save non-user attendants
	if (createdEvent && attendantNames && attendantNames.length > 0) {
		await addEventAttendants(createdEvent.id, attendantNames);
	}
	return createdEvent;
}

export async function updateEventById(id: string, data: Partial<Omit<CalendarEvent, 'id'>>, userId: string, attendantNames?: string[]) {
	const accessibleCalIds = await getAccessibleCalendarIds(userId);
	const [updatedEvent] = await db
		.update(events)
		.set(data)
		.where(and(eq(events.id, id), eventAccessFilter(userId, accessibleCalIds)))
		.returning();
	if (updatedEvent && attendantNames !== undefined) {
		await syncEventAttendants(id, attendantNames);
	}
	return updatedEvent;
}

export async function deleteEvent(id: string) {
	await db.delete(events).where(eq(events.id, id));
}

export async function deleteEventById(id: string, userId: string) {
	const removed = await db
		.delete(events)
		.where(and(eq(events.id, id), eq(events.ownerId, userId)))
		.returning({ id: events.id });
	return removed.length;
}

/** Delete an event the user owns OR one living on an accessible calendar
 *  (personal or family) — mirrors the calendar's read scope. */
export async function deleteEventInScope(id: string, userId: string, calendarIds: string[]) {
	await db
		.delete(events)
		.where(
			and(
				eq(events.id, id),
				or(
					eq(events.ownerId, userId),
					calendarIds.length > 0 ? inArray(events.calendarId, calendarIds) : sql`false`
				)
			)
		);
}

export async function updateRsvp(eventId: string, userId: string, status: 'going' | 'maybe' | 'declined' | 'undecided') {
	// Atomic upsert against the partial unique index
	// event_attendance_user_unique (userId is non-null, so the insert
	// satisfies its WHERE user_id IS NOT NULL predicate).
	await db
		.insert(eventAttendance)
		.values({ eventId, userId, status })
		.onConflictDoUpdate({
			target: [eventAttendance.eventId, eventAttendance.userId],
			// The arbiter index is PARTIAL (WHERE user_id IS NOT NULL), so the
			// conflict target must carry that predicate too — otherwise Postgres
			// fails with "no unique or exclusion constraint matching the
			// ON CONFLICT specification" on every update (incl. clearing).
			targetWhere: sql`${eventAttendance.userId} IS NOT NULL`,
			set: { status }
		});
}

export async function getEventRsvpStatus(eventId: string) {
	return await db
		.select()
		.from(eventAttendance)
		.where(eq(eventAttendance.eventId, eventId));
}
