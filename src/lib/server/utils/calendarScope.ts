import { db } from '$lib/server/db';
import { calendars, events, familyMembers } from '$lib/server/db/schema';
import { and, eq, inArray, or, sql } from 'drizzle-orm';

/**
 * Ids of calendars the user can see: their personal calendars plus the
 * calendar(s) of any family they belong to. The canonical read/write
 * scope — every event-level authorization check should use this.
 */
export async function getAccessibleCalendarIds(userId: string): Promise<string[]> {
	const [member] = await db
		.select()
		.from(familyMembers)
		.where(eq(familyMembers.userId, userId));
	const where = member?.familyId
		? or(eq(calendars.ownerId, userId), eq(calendars.familyId, member.familyId))
		: eq(calendars.ownerId, userId);
	return (await db.select({ id: calendars.id }).from(calendars).where(where)).map((c) => c.id);
}

/**
 * WHERE fragment: event belongs to the user OR lives on an accessible
 * calendar. Combine with and(..., eventAccessFilter(userId, calIds)).
 */
export function eventAccessFilter(userId: string, accessibleCalIds: string[]) {
	return or(
		eq(events.ownerId, userId),
		accessibleCalIds.length > 0 ? inArray(events.calendarId, accessibleCalIds) : sql`false`
	);
}
