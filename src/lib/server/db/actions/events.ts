import { db } from '$lib/server/db';
import { eventAttendance, events, users, type CalendarEvent } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export async function getEvents() {
	return await db.select().from(events).orderBy(events.start);
}

export async function getEvent(id: string) {
	const [event] = await db.select().from(events).where(eq(events.id, id));
	return event;
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
	const [updatedEvent] = await db.update(events).set(data).where(eq(events.id, id)).returning();
	if (updatedEvent && attendantNames !== undefined) {
		await syncEventAttendants(id, attendantNames);
	}
	return updatedEvent;
}

export async function updateEvent(id: string, data: Partial<Omit<CalendarEvent, 'id'>>) {
	const [updatedEvent] = await db.update(events).set(data).where(eq(events.id, id)).returning();
	return updatedEvent;
}

export async function deleteEvent(id: string) {
	await db.delete(events).where(eq(events.id, id));
}

export async function deleteEventById(id: string, userId: string) {
	await db.delete(events).where(and(eq(events.id, id), eq(events.ownerId, userId)));
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
