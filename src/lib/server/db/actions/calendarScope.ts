import { db } from '$lib/server/db';
import { calendars, events, familyMembers } from '$lib/server/db/schema';
import { eq, inArray, or, sql } from 'drizzle-orm';

/**
 * Ids of calendars the user can see: their personal calendars plus the
 * calendar(s) of any family they belong to. The canonical read/write
 * scope — every event-level authorization check should use this.
 */
export async function getAccessibleCalendarIds(userId: string): Promise<string[]> {
	// EVERY family the user is a Family Member of — this used to take the first
	// `familyMembers` row, hiding the calendars of every other family the user
	// belonged to (issue 098).
	const memberships = await db
		.select({ familyId: familyMembers.familyId })
		.from(familyMembers)
		.where(eq(familyMembers.userId, userId));
	const familyIds = [...new Set(memberships.map((m) => m.familyId))];
	const where =
		familyIds.length > 0
			? or(eq(calendars.ownerId, userId), inArray(calendars.familyId, familyIds))
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

/**
 * Whether the user may touch a single Event: they own it OR its Calendar
 * is in their accessible set (personal + every family they belong to).
 * Fetches the event itself so the caller doesn't duplicate the lookup.
 *
 * Returns `'not-found'` when the event doesn't exist and `'forbidden'`
 * when it exists but the caller may not touch it.
 */
export async function canTouchEvent(
	userId: string,
	eventId: string
): Promise<'not-found' | 'forbidden' | 'allowed'> {
	const [event] = await db
		.select({ calendarId: events.calendarId, ownerId: events.ownerId })
		.from(events)
		.where(eq(events.id, eventId))
		.limit(1);
	if (!event) return 'not-found';
	const accessibleCalIds = await getAccessibleCalendarIds(userId);
	if (event.ownerId === userId) return 'allowed';
	if (event.calendarId && accessibleCalIds.includes(event.calendarId)) return 'allowed';
	return 'forbidden';
}
