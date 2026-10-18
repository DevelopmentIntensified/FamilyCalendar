import { db } from '$lib/server/db';
import { authSession, events, tasks, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { session, sessionCookieName } from '$lib/server/auth';
import { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
import { isAnonymousAccount } from '$lib/utils/anonymous';

export const GUEST_MERGE_COOKIE = 'guest_merge';

/**
 * Called at the top of login endpoints: if the incoming session belongs to
 * an Anonymous Account, stash its id in a short-lived cookie so the merge
 * prompt can fire once the user is authenticated.
 */
export async function stashGuestFromCookies(cookies: Pick<Cookies, 'get' | 'set' | 'delete'>) {
	try {
		const { session: sessionRow, user } = await session.validateSession(
			cookies.get(sessionCookieName)
		);
		if (!sessionRow || !user || !isAnonymousAccount(user)) return;
		cookies.set(GUEST_MERGE_COOKIE, user.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 15
		});
	} catch {
		// Never block login because of stash bookkeeping.
	}
}

/** The Anonymous Account row for `userId`, or null when the user is real. */
export async function getAnonymousUser(userId: string) {
	const [user] = await db.select().from(users).where(eq(users.id, userId));
	if (!isAnonymousAccount(user)) return null;
	return user;
}

/** How much data the guest would bring along. */
export async function getGuestDataCounts(guestId: string) {
	const eventRows = await db
		.select({ id: events.id })
		.from(events)
		.where(eq(events.ownerId, guestId));
	const taskRows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.userId, guestId));
	return { events: eventRows.length, tasks: taskRows.length };
}

/**
 * Moves every guest event/task onto the target account, then removes the
 * guest. Events land on the target's personal calendar (created if absent);
 * checklist links survive because event ids are preserved.
 */
export async function mergeGuestIntoUser(
	guestId: string,
	targetUserId: string
): Promise<{ events: number; tasks: number } | null> {
	const guest = await getAnonymousUser(guestId);
	if (!guest || guestId === targetUserId) return null;

	return db.transaction(async (tx) => {
		// Target personal calendar (family calendars excluded), re-checked
		// inside this transaction so concurrent merges can't double-create it.
		const personalCal = await ensurePersonalCalendar(targetUserId, tx);
		if (!personalCal) return null;

		const movedEvents = await tx
			.update(events)
			.set({ ownerId: targetUserId, calendarId: personalCal.id })
			.where(eq(events.ownerId, guestId))
			.returning({ id: events.id });

		const movedTasks = await tx
			.update(tasks)
			.set({ userId: targetUserId })
			.where(eq(tasks.userId, guestId))
			.returning({ id: tasks.id });

		// Kill guest sessions first so cascade order stays clean.
		await tx.delete(authSession).where(eq(authSession.userId, guestId));
		await tx.delete(users).where(eq(users.id, guestId));

		return { events: movedEvents.length, tasks: movedTasks.length };
	});
}

/** Used by the merge prompt to confirm the guest still exists & is anonymous. */
export async function isClaimableGuest(guestId: string): Promise<boolean> {
	const guest = await getAnonymousUser(guestId);
	return !!guest;
}
