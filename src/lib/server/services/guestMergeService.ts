import { db } from '$lib/server/db';
import {
	calendars,
	events,
	sessions,
	tasks,
	users,
	familyMembers
} from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { lucia } from '$lib/server/auth';

export const GUEST_MERGE_COOKIE = 'guest_merge';

/**
 * Called at the top of login endpoints: if the incoming session belongs to
 * an Anonymous Account, stash its id in a short-lived cookie so the merge
 * prompt can fire once the user is authenticated.
 */
export async function stashGuestFromCookies(cookies: {
	get: (name: string) => string | undefined;
	set: (name: string, value: string, opts?: Record<string, unknown>) => void;
	delete: (name: string, opts?: Record<string, unknown>) => void;
}) {
	try {
		const sessionId = cookies.get(lucia.sessionCookieName);
		if (!sessionId) return;
		const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
		if (!session || session.expiresAt < new Date()) return;
		const guest = await getAnonymousUser(session.userId);
		if (guest) {
			cookies.set(GUEST_MERGE_COOKIE, guest.id, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 60 * 15
			});
		}
	} catch {
		// Never block login because of stash bookkeeping.
	}
}

/** True when the user row is an Anonymous Account (no email yet). */
export async function getAnonymousUser(userId: string) {
	const [user] = await db.select().from(users).where(eq(users.id, userId));
	if (!user || user.email !== null) return null;
	return user;
}

/** How much data the guest would bring along. */
export async function getGuestDataCounts(guestId: string) {
	const eventRows = await db.select({ id: events.id }).from(events).where(eq(events.ownerId, guestId));
	const taskRows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.userId, guestId));
	return { events: eventRows.length, tasks: taskRows.length };
}

/**
 * Moves every guest event/task onto the target account, then removes the
 * guest. Events land on the target's personal calendar (created if absent);
 * checklist links survive because event ids are preserved.
 */
export async function mergeGuestIntoUser(guestId: string, targetUserId: string): Promise<{ events: number; tasks: number } | null> {
	const guest = await getAnonymousUser(guestId);
	if (!guest || guestId === targetUserId) return null;

	// Target personal calendar (family calendars excluded).
	let [personalCal] = await db
		.select()
		.from(calendars)
		.where(and(eq(calendars.ownerId, targetUserId), isNull(calendars.familyId)));
	if (!personalCal) {
		await db.insert(calendars).values({ ownerId: targetUserId });
		const [created] = await db
			.select()
			.from(calendars)
			.where(and(eq(calendars.ownerId, targetUserId), isNull(calendars.familyId)));
		personalCal = created;
	}
	if (!personalCal) return null;

	const movedEvents = await db
		.update(events)
		.set({ ownerId: targetUserId, calendarId: personalCal.id })
		.where(eq(events.ownerId, guestId))
		.returning({ id: events.id });

	const movedTasks = await db
		.update(tasks)
		.set({ userId: targetUserId })
		.where(eq(tasks.userId, guestId))
		.returning({ id: tasks.id });

	// Kill guest sessions first so cascade order stays clean.
	await db.delete(sessions).where(eq(sessions.userId, guestId));
	await db.delete(users).where(eq(users.id, guestId));

	return { events: movedEvents.length, tasks: movedTasks.length };
}

/** Used by the merge prompt to confirm the guest still exists & is anonymous. */
export async function isClaimableGuest(guestId: string): Promise<boolean> {
	const guest = await getAnonymousUser(guestId);
	return !!guest;
}

/** Family membership check helper reused by prompts. */
export async function getUserFamilyId(userId: string): Promise<string | null> {
	const [member] = await db
		.select({ familyId: familyMembers.familyId })
		.from(familyMembers)
		.where(eq(familyMembers.userId, userId));
	return member?.familyId ?? null;
}
