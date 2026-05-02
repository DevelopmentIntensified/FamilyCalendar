import { db } from '$lib/server/db';
import { eventAttendance, events, type CalendarEvent } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export async function getEvents() {
	return await db.select().from(events).orderBy(events.start);
}

export async function getEvent(id: string) {
	const [event] = await db.select().from(events).where(eq(events.id, id));
	return event;
}

export async function getEventAttendance(id: string) {
	const [event] = await db
		.select()
		.from(events)
		.leftJoin(eventAttendance, eq(eventAttendance.eventId, events.id))
		.where(eq(events.id, id));
	return event;
}

export async function createEvent(data: Omit<CalendarEvent, 'id' | 'created_at'>, ownerId: string) {
	const [createdEvent] = await db.insert(events).values(data).returning();
	// Auto-RSVP creator as "going"
	if (createdEvent && ownerId) {
		await db.insert(eventAttendance).values({
			eventId: createdEvent.id,
			userId: ownerId,
			status: 'going'
		});
	}
	return createdEvent;
}

export async function updateEvent(id: string, data: Partial<Omit<CalendarEvent, 'id'>>) {
	const [updatedEvent] = await db.update(events).set(data).where(eq(events.id, id)).returning();
	return updatedEvent;
}

export async function deleteEvent(id: string) {
	await db.delete(events).where(eq(events.id, id));
}

export async function updateRsvp(eventId: string, userId: string, status: 'going' | 'maybe' | 'declined' | 'undecided') {
	// Upsert: update if exists, insert if not
	const existing = await db
		.select()
		.from(eventAttendance)
		.where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.userId, userId)));

	if (existing.length > 0) {
		await db
			.update(eventAttendance)
			.set({ status })
			.where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.userId, userId)));
	} else {
		await db.insert(eventAttendance).values({
			eventId,
			userId,
			status
		});
	}
}

export async function getEventRsvpStatus(eventId: string) {
	return await db
		.select()
		.from(eventAttendance)
		.where(eq(eventAttendance.eventId, eventId));
}

export async function getUserRsvp(eventId: string, userId: string) {
	const [rsvp] = await db
		.select()
		.from(eventAttendance)
		.where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.userId, userId)));
	return rsvp;
}
