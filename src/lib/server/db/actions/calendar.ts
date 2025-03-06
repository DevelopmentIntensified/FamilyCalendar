import { db } from '$lib/server/db';
import { calendars, events, type Calendar } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function getCalendars() {
	return await db.select().from(calendars);
}

export async function getCalendarEvents(id: string) {
	const [calendar] = await db
		.select()
		.from(calendars)
		.leftJoin(events, eq(calendars.id, events.calendarId))
		.where(eq(calendars.id, id));
	return calendar;
}

export async function getCalendar(id: string) {
	const [calendar] = await db.select().from(calendars).where(eq(calendars.id, id));
	return calendar;
}

export async function getUserCalendar(userId: string) {
	const [userCalendar] = await db
		.select()
		.from(calendars)
		.where(eq(calendars.ownerId, userId))
	return userCalendar
}

export async function createCalendar(data: typeof calendars.$inferInsert) {
	const [createdCalendar] = await db.insert(calendars).values(data).returning();
	return createdCalendar;
}

export async function updateCalendar(
	id: string,
	data: Partial<Omit<Calendar, 'id' | 'createdAt'>>
) {
	const [updatedCalendar] = await db
		.update(calendars)
		.set(data)
		.where(eq(calendars.id, id))
		.returning();
	return updatedCalendar;
}

export async function deleteCalendar(id: string) {
	const [deletedCalendar] = await db.delete(calendars).where(eq(calendars.id, id)).returning();
	return deletedCalendar;
}
