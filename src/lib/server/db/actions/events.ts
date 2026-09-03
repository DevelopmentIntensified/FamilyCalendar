import { db } from '$lib/server/db';
import { eventAttendance, eventExceptions, events, users, type CalendarEvent } from '$lib/server/db/schema';
import type { EventAttendanceSummary } from '$lib/types';
import { eq, and, sql, inArray, or } from 'drizzle-orm';
import { getAccessibleCalendarIds, eventAccessFilter } from '$lib/server/db/actions/calendarScope';
import { toDateTime } from '$lib/server/utils/eventTimes';

export async function getEvent(id: string) {
	const [event] = await db.select().from(events).where(eq(events.id, id));
	return event;
}

export async function getExceptionsByEventIds(eventIds: string[]) {
	if (eventIds.length === 0) return [];
	return await db.select().from(eventExceptions).where(inArray(eventExceptions.eventId, eventIds));
}

export async function findException(eventId: string, originalDateIso: string) {
	// timestamptz equality only matches when the string renders exactly like
	// Postgres would; normalize any ISO-ish input to UTC ISO first.
	const originalDate = toDateTime(originalDateIso)?.toUTC().toISO() ?? originalDateIso;
	const [exception] = await db
		.select()
		.from(eventExceptions)
		.where(and(eq(eventExceptions.eventId, eventId), eq(eventExceptions.originalDate, originalDate)));
	return exception;
}

export async function upsertException(data: {
	eventId: string;
	originalDate: string;
	isCancelled?: boolean;
	title?: string | null;
	description?: string | null;
	location?: string | null;
	start?: string | null;
	end?: string | null;
	allDay?: boolean | null;
}) {
	// Select-then-write is racy without a unique index on (event_id, original_date):
	// two concurrent edits can both miss the select and insert duplicates.
	// Once that unique index exists this can become a single
	// insert(...).onConflictDoUpdate({ target: [eventId, originalDate] }).
	const originalDate = toDateTime(data.originalDate)?.toUTC().toISO() ?? data.originalDate;
	const existing = await findException(data.eventId, originalDate);
	if (existing) {
		const [updated] = await db
			.update(eventExceptions)
			.set({
				isCancelled: data.isCancelled ?? existing.isCancelled,
				title: data.title !== undefined ? data.title : existing.title,
				description: data.description !== undefined ? data.description : existing.description,
				location: data.location !== undefined ? data.location : existing.location,
				start: data.start !== undefined ? data.start : existing.start,
				end: data.end !== undefined ? data.end : existing.end,
				allDay: data.allDay !== undefined ? data.allDay : existing.allDay
			})
			.where(eq(eventExceptions.id, existing.id))
			.returning();
		return updated;
	}
	const [created] = await db
		.insert(eventExceptions)
		.values({
			eventId: data.eventId,
			originalDate,
			isCancelled: data.isCancelled ?? false,
			title: data.title ?? null,
			description: data.description ?? null,
			location: data.location ?? null,
			start: data.start ?? null,
			end: data.end ?? null,
			allDay: data.allDay ?? null
		})
		.returning();
	return created;
}

export async function getEventAttendance(id: string) {
	return await db
		.select({
			id: eventAttendance.id,
			eventId: eventAttendance.eventId,
			userId: eventAttendance.userId,
			name: eventAttendance.name,
			status: eventAttendance.status,
			inviteType: eventAttendance.inviteType,
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

/** A member or guest invitation. Members set `userId`; guests set `name`. */
export type EventInvite = {
	userId?: string | null;
	name?: string | null;
	inviteType: 'required' | 'optional';
};

/** Normalize a mix of legacy string names and structured invites. */
export function normalizeInvites(raw: unknown): EventInvite[] {
	if (!Array.isArray(raw)) return [];
	const out: EventInvite[] = [];
	for (const entry of raw) {
		if (typeof entry === 'string') {
			const name = entry.trim();
			if (name) out.push({ name, inviteType: 'optional' });
		} else if (entry && typeof entry === 'object') {
			const i = entry as Partial<EventInvite>;
			if (i.userId) out.push({ userId: i.userId, inviteType: i.inviteType === 'required' ? 'required' : 'optional' });
			else if (i.name && typeof i.name === 'string' && i.name.trim())
				out.push({ name: i.name.trim(), inviteType: 'optional' });
		}
	}
	return out;
}

/**
 * Full re-sync of an event's invitations.
 *
 * - Member rows (userId set): upserted with the given inviteType, preserving
 *   any RSVP response. Members no longer invited who haven't responded are
 *   dropped; members who already responded keep their row (as optional).
 * - Guest rows (name set): all replaced by the provided names.
 *
 * The creator's own "going" row (status ≠ undecided) is never deleted.
 */
export async function replaceEventInvites(eventId: string, raw: unknown) {
	const invites = normalizeInvites(raw);
	await db.transaction(async (tx) => {
		const existing = await tx
			.select({ id: eventAttendance.id, userId: eventAttendance.userId, name: eventAttendance.name, status: eventAttendance.status, inviteType: eventAttendance.inviteType })
			.from(eventAttendance)
			.where(eq(eventAttendance.eventId, eventId));

		const confirmedType = (t?: string | null): 'required' | 'optional' =>
			t === 'required' ? 'required' : 'optional';

		// --- Members ---
		const userRows = existing.filter((r) => r.userId);
		const byUser = new Map(userRows.map((r) => [r.userId, r]));
		const requested = new Set<string>();
		for (const inv of invites) {
			if (!inv.userId) continue;
			if (requested.has(inv.userId)) continue;
			requested.add(inv.userId);
			const type = confirmedType(inv.inviteType);
			const row = byUser.get(inv.userId);
			if (row) {
				if (row.inviteType !== type) {
					await tx.update(eventAttendance).set({ inviteType: type }).where(eq(eventAttendance.id, row.id));
				}
			} else {
				await tx
					.insert(eventAttendance)
					.values({ eventId, userId: inv.userId, status: 'undecided', inviteType: type });
			}
		}
		for (const row of userRows) {
			if (row.userId && !requested.has(row.userId)) {
				if (row.status === 'undecided') {
					await tx.delete(eventAttendance).where(eq(eventAttendance.id, row.id));
				} else if (row.inviteType === 'required') {
					await tx.update(eventAttendance).set({ inviteType: 'optional' }).where(eq(eventAttendance.id, row.id));
				}
			}
		}

		// --- Guests ---
		await tx
			.delete(eventAttendance)
			.where(and(eq(eventAttendance.eventId, eventId), sql`${eventAttendance.name} IS NOT NULL`));
		const guests = invites
			.filter((i) => i.name && typeof i.name === 'string' && i.name.trim())
			.map((i) => ({ eventId, name: (i.name as string).trim(), status: 'undecided' as const, inviteType: 'optional' as const }));
		if (guests.length > 0) await tx.insert(eventAttendance).values(guests);
	});
}

export async function createEvent(data: Omit<CalendarEvent, 'id' | 'created_at'>, ownerId: string, invites?: EventInvite[] | unknown) {
	const [createdEvent] = await db.insert(events).values(data).returning();
	// Auto-RSVP creator as "going"
	if (createdEvent && ownerId) {
		await db.insert(eventAttendance).values({
			eventId: createdEvent.id,
			userId: ownerId,
			status: 'going',
			inviteType: 'optional'
		});
	}
	// Save invitations (members + guests)
	if (createdEvent && invites !== undefined) {
		await replaceEventInvites(createdEvent.id, invites);
	}
	return createdEvent;
}

export async function updateEventById(id: string, data: Partial<Omit<CalendarEvent, 'id'>>, userId: string, invites?: unknown, accessibleCalIds?: string[]) {
	const calIds = accessibleCalIds ?? await getAccessibleCalendarIds(userId);
	const [updatedEvent] = await db
		.update(events)
		.set(data)
		.where(and(eq(events.id, id), eventAccessFilter(userId, calIds)))
		.returning();
	if (updatedEvent && invites !== undefined) {
		await replaceEventInvites(id, invites);
	}
	return updatedEvent;
}

/**
 * Compact per-master "who's going" summary for a set of event (master) ids.
 * Counts only member rows (userId set) — guests never appear.
 * Keyed by eventId.
 */
export async function getEventAttendanceSummaries(eventIds: string[]) {
	if (eventIds.length === 0) return new Map<string, EventAttendanceSummary>();
	const rows = await db
		.select({
			eventId: eventAttendance.eventId,
			userId: eventAttendance.userId,
			status: eventAttendance.status,
			inviteType: eventAttendance.inviteType,
			firstName: users.firstName
		})
		.from(eventAttendance)
		.leftJoin(users, eq(eventAttendance.userId, users.id))
		.where(and(inArray(eventAttendance.eventId, eventIds), sql`${eventAttendance.userId} IS NOT NULL`));

	const map = new Map<string, EventAttendanceSummary>();
	for (const r of rows) {
		let s = map.get(r.eventId);
		if (!s) {
			s = { going: 0, invited: 0, required: 0, requiredPending: 0, goingNames: [] };
			map.set(r.eventId, s);
		}
		s.invited += 1;
		if (r.inviteType === 'required') {
			s.required += 1;
			if (r.status !== 'going') s.requiredPending += 1;
		}
		if (r.status === 'going') {
			s.going += 1;
			if (r.firstName) s.goingNames.push(r.firstName);
		}
	}
	return map;
}

export async function deleteEvent(id: string) {
	await db.delete(events).where(eq(events.id, id));
}

export async function deleteEventById(id: string, userId: string) {
	const removed = await db
		.delete(events)
		.where(and(eq(events.id, id), eq(events.ownerId, userId)))
		.returning({ id: events.id });
	return removed.length;
}

/** Delete an event the user owns OR one living on an accessible calendar
 *  (personal or family) — mirrors the calendar's read scope. */
export async function deleteEventInScope(id: string, userId: string, calendarIds: string[]) {
	await db
		.delete(events)
		.where(
			and(
				eq(events.id, id),
				or(
					eq(events.ownerId, userId),
					calendarIds.length > 0 ? inArray(events.calendarId, calendarIds) : sql`false`
				)
			)
		);
}

export async function updateRsvp(eventId: string, userId: string, status: 'going' | 'maybe' | 'declined' | 'undecided') {
	// Atomic upsert against the partial unique index
	// event_attendance_user_unique (userId is non-null, so the insert
	// satisfies its WHERE user_id IS NOT NULL predicate).
	await db
		.insert(eventAttendance)
		.values({ eventId, userId, status })
		.onConflictDoUpdate({
			target: [eventAttendance.eventId, eventAttendance.userId],
			// The arbiter index is PARTIAL (WHERE user_id IS NOT NULL), so the
			// conflict target must carry that predicate too — otherwise Postgres
			// fails with "no unique or exclusion constraint matching the
			// ON CONFLICT specification" on every update (incl. clearing).
			targetWhere: sql`${eventAttendance.userId} IS NOT NULL`,
			set: { status }
		});
}

/** The current user's RSVP status per master event id (empty when none). */
export async function getUserRsvpStatuses(userId: string, eventIds: string[]) {
	if (eventIds.length === 0) return [];
	return await db
		.select({ eventId: eventAttendance.eventId, status: eventAttendance.status })
		.from(eventAttendance)
		.where(and(inArray(eventAttendance.eventId, eventIds), eq(eventAttendance.userId, userId)));
}

export async function getEventRsvpStatus(eventId: string) {
	return await db
		.select()
		.from(eventAttendance)
		.where(eq(eventAttendance.eventId, eventId));
}
