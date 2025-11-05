import { db } from '$lib/server/db';
import { eventAttendance, events, type CalendarEvent } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

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

export async function createEvent(data: Omit<CalendarEvent, 'id' | 'created_at'>) {
	const [createdEvent] = await db.insert(events).values(data).returning();
	return createdEvent;
}

export async function updateEvent(id: string, data: Partial<Omit<CalendarEvent, 'id'>>) {
	const [updatedEvent] = await db.update(events).set(data).where(eq(events.id, id)).returning();
	return updatedEvent;
}

export async function deleteEvent(id: string) {
	await db.delete(events).where(eq(events.id, id));
}
