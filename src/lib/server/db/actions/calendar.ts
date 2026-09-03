import { db } from '$lib/server/db';
import { calendars, events, type Calendar } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

/** Minimal query surface shared by `db` and transaction clients. */
type CalendarClient = {
	select: typeof db.select;
	insert: typeof db.insert;
};

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
	const cals = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
	return cals[0] || null;
}

export async function createCalendar(data: typeof calendars.$inferInsert) {
	const [createdCalendar] = await db.insert(calendars).values(data).returning();
	return createdCalendar;
}

export async function createUserCalendar(userId: string) {
	const [createdCalendar] = await db
		.insert(calendars)
		.values({
			ownerId: userId
		})
		.returning();
	return createdCalendar;
}

/**
 * Idempotently ensures the user's **Personal Calendar** (own + familyId IS
 * NULL) exists, returning the existing-or-created row.
 *
 * `create-if-absent`: when no own, family-less calendar exists, one is
 * inserted and returned. Accepts an OPTIONAL transaction client so callers
 * that already wrap their work in `db.transaction(tx => ...)` (e.g. the
 * guest merge path) can create on the SAME transaction — precedent:
 * `updateEventById` takes optional context params.
 */
export async function ensurePersonalCalendar(
	userId: string,
	tx?: CalendarClient
): Promise<Calendar | null> {
	const client = tx ?? db;

	let [personalCal] = await client
		.select()
		.from(calendars)
		.where(and(eq(calendars.ownerId, userId), isNull(calendars.familyId)));
	if (!personalCal) {
		[personalCal] = await client.insert(calendars).values({ ownerId: userId }).returning();
	}
	return personalCal ?? null;
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
