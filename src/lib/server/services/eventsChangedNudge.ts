import { inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendars, familyMembers } from '$lib/server/db/schema';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';
import { isFcmConfigured } from './fcmService';
import { sendDataToUsers } from './devicePushService';

/**
 * Silent sync nudge (#272): after any event mutation, every user who can see
 * an affected calendar gets one FCM data message `events_changed`, so their
 * phone refetches events and reschedules local reminders (#271/#273).
 *
 * Contract for mutation paths: call ONCE per request, after the write, with
 * the calendar ids the request touched (old + new on a move), and do NOT
 * await it. The audience is resolved off the request path:
 *   actor ∪ owners of the touched calendars ∪ family members of their
 *   families, plus the actor's own accessible calendars (covers family-mirror
 *   copies on the family calendar). A superset is fine — the message is
 *   silent and collapsed.
 *
 * The returned promise never rejects; it exists for tests.
 */
export interface NudgeDeps {
	isConfigured: () => boolean;
	accessibleCalendarIds: (userId: string) => Promise<string[]>;
	/** Every user who can read any of these calendars (duplicates allowed). */
	calendarAudience: (calendarIds: string[]) => Promise<string[]>;
	sendDataToUsers: (userIds: string[], data: { type: 'events_changed' }) => Promise<void>;
}

async function realCalendarAudience(calendarIds: string[]): Promise<string[]> {
	if (calendarIds.length === 0) return [];
	const cals = await db
		.select({ ownerId: calendars.ownerId, familyId: calendars.familyId })
		.from(calendars)
		.where(inArray(calendars.id, calendarIds));
	const familyIds = [...new Set(cals.map((c) => c.familyId).filter((id): id is string => !!id))];
	const members =
		familyIds.length > 0
			? await db
					.select({ userId: familyMembers.userId })
					.from(familyMembers)
					.where(inArray(familyMembers.familyId, familyIds))
			: [];
	return [...cals.map((c) => c.ownerId), ...members.map((m) => m.userId)].filter(
		(id): id is string => !!id
	);
}

const defaultDeps: NudgeDeps = {
	isConfigured: () => isFcmConfigured(),
	accessibleCalendarIds: getAccessibleCalendarIds,
	calendarAudience: realCalendarAudience,
	sendDataToUsers
};

export function nudgeEventsChanged(
	actorId: string,
	calendarIds: (string | null | undefined)[] = [],
	deps: NudgeDeps = defaultDeps
): Promise<void> {
	// Unconfigured (dev, tests, preview without Firebase): no db work at all.
	if (!deps.isConfigured()) return Promise.resolve();
	const touched = calendarIds.filter((id): id is string => !!id);
	return (async () => {
		const accessible = await deps.accessibleCalendarIds(actorId);
		const audience = await deps.calendarAudience([...new Set([...touched, ...accessible])]);
		const users = [...new Set([actorId, ...audience])];
		await deps.sendDataToUsers(users, { type: 'events_changed' });
	})().catch((error: unknown) => {
		console.error('events_changed nudge failed:', error);
	});
}
