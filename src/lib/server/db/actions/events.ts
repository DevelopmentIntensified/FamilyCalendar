import { db } from '$lib/server/db';
import {
	eventAttendance,
	eventExceptions,
	events,
	users,
	type CalendarEvent
} from '$lib/server/db/schema';
import type { EventAttendanceSummary } from '$lib/types';
import { eq, and, sql, inArray, or } from 'drizzle-orm';
import { getAccessibleCalendarIds, eventAccessFilter } from '$lib/server/db/actions/calendarScope';
import { toDateTime } from '$lib/server/utils/eventTimes';

/**
 * Minimal query surface shared by `db` and transaction clients (precedent:
 * calendar.ts's CalendarClient). Lets callers thread an open transaction
 * through create/replace-invites so an event + its attendance rows commit
 * atomically.
 */
type EventClient = {
	select: typeof db.select;
	insert: typeof db.insert;
	update: typeof db.update;
	delete: typeof db.delete;
};

export async function getEvent(id: string): Promise<CalendarEvent | undefined> {
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
		.where(
			and(eq(eventExceptions.eventId, eventId), eq(eventExceptions.originalDate, originalDate))
		);
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
	const insertData = names.map((name) => ({
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

/** True when the raw invite entry is a legacy guest-name string. */
function isInviteName(entry: unknown): entry is string {
	return typeof entry === 'string';
}

/** True when the raw invite entry is a structured invite object. */
function isInviteObject(entry: unknown): entry is Partial<EventInvite> {
	return typeof entry === 'object' && entry !== null;
}

/** Normalize a mix of legacy string names and structured invites. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- exported boundary parser: unknown input IS its contract; routes feed it raw request-body fields.
export function normalizeInvites(raw: unknown): EventInvite[] {
	if (!Array.isArray(raw)) return [];
	const out: EventInvite[] = [];
	for (const entry of raw) {
		if (isInviteName(entry)) {
			const name = entry.trim();
			if (name) out.push({ name, inviteType: 'optional' });
		} else if (entry && isInviteObject(entry)) {
			if (entry.userId)
				out.push({
					userId: entry.userId,
					inviteType: entry.inviteType === 'required' ? 'required' : 'optional'
				});
			else if (entry.name && isInviteName(entry.name) && entry.name.trim())
				out.push({ name: entry.name.trim(), inviteType: 'optional' });
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
export async function replaceEventInvites(eventId: string, raw: unknown[], client?: EventClient) {
	const invites = normalizeInvites(raw);
	const run = async (tx: EventClient) => {
		const existing = await tx
			.select({
				id: eventAttendance.id,
				userId: eventAttendance.userId,
				name: eventAttendance.name,
				status: eventAttendance.status,
				inviteType: eventAttendance.inviteType
			})
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
					await tx
						.update(eventAttendance)
						.set({ inviteType: type })
						.where(eq(eventAttendance.id, row.id));
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
					await tx
						.update(eventAttendance)
						.set({ inviteType: 'optional' })
						.where(eq(eventAttendance.id, row.id));
				}
			}
		}

		// --- Guests ---
		await tx
			.delete(eventAttendance)
			.where(and(eq(eventAttendance.eventId, eventId), sql`${eventAttendance.name} IS NOT NULL`));
		const guests = invites.flatMap((i) =>
			isInviteName(i.name) && i.name.trim()
				? [
						{
							eventId,
							name: i.name.trim(),
							status: 'undecided' as const,
							inviteType: 'optional' as const
						}
					]
				: []
		);
		if (guests.length > 0) await tx.insert(eventAttendance).values(guests);
	};
	return client ? run(client) : db.transaction(run);
}

export async function createEvent(
	data: Omit<CalendarEvent, 'id' | 'created_at'>,
	ownerId: string,
	invites?: unknown[],
	client?: EventClient
) {
	// Event row + creator RSVP + invites land in ONE transaction (or on the
	// caller's transaction) — a failed invite write no longer leaves a
	// half-written event behind.
	const run = async (tx: EventClient) => {
		// SAFETY: CalendarEvent keeps mirrorOf optional for writers; the column
		// is nullable with no default, so an omitted mirrorOf stores NULL.
		const [createdEvent] = await tx
			.insert(events)
			.values(data as typeof events.$inferInsert)
			.returning();
		// Auto-RSVP creator as "going"
		if (createdEvent && ownerId) {
			await tx.insert(eventAttendance).values({
				eventId: createdEvent.id,
				userId: ownerId,
				status: 'going',
				inviteType: 'optional'
			});
		}
		// Save invitations (members + guests)
		if (createdEvent && invites !== undefined) {
			await replaceEventInvites(createdEvent.id, invites, tx);
		}
		return createdEvent;
	};
	return client ? run(client) : db.transaction(run);
}

export async function updateEventById(
	id: string,
	data: Partial<Omit<CalendarEvent, 'id'>>,
	userId: string,
	invites?: unknown[],
	accessibleCalIds?: string[]
): Promise<CalendarEvent | undefined> {
	const calIds = accessibleCalIds ?? (await getAccessibleCalendarIds(userId));
	const updatedEvent = await db.transaction(async (tx) => {
		const [existing] = await tx
			.select()
			.from(events)
			.where(and(eq(events.id, id), eventAccessFilter(userId, calIds)));
		if (!existing) return undefined;
		const [updated] = await tx.update(events).set(data).where(eq(events.id, id)).returning();
		// A whole-series move re-anchors every occurrence slot. Exception
		// Overrides are keyed to the ORIGINAL recurrence slot (originalDate),
		// so shift them — and their start/end overrides — by the same delta,
		// or cancelled/edited occurrences resurrect at the wrong slot.
		if (data.start !== undefined && existing.recurrenceFrequency) {
			const deltaMs = new Date(data.start).getTime() - new Date(existing.start).getTime();
			if (deltaMs !== 0) {
				const exceptions = await tx
					.select()
					.from(eventExceptions)
					.where(eq(eventExceptions.eventId, id));
				for (const ex of exceptions) {
					await tx
						.update(eventExceptions)
						.set(shiftException(ex, deltaMs))
						.where(eq(eventExceptions.id, ex.id));
				}
			}
		}
		if (updated) {
			// Invites join the SAME transaction — previously they ran after it
			// and a failure left the edit committed without its attendees.
			if (invites !== undefined) {
				await replaceEventInvites(id, invites, tx);
			}
			await syncFamilyMirror(tx, id, data);
		}
		return updated;
	});
	return updatedEvent;
}

/**
 * Propagate a master edit to its family-calendar mirror row(s)
 * (`mirrorOf = masterId`, created by syncEventsToFamilyCalendar).
 * Scope-minimal: whole-series and non-recurring field edits propagate;
 * single-occurrence Exception Overrides (the upsertException path) do NOT —
 * known limitation, see docs/issues/014. calendarId is deliberately
 * excluded: the mirror stays on the family calendar.
 */
async function syncFamilyMirror(
	tx: EventClient,
	masterId: string,
	data: Partial<Omit<CalendarEvent, 'id'>>
) {
	const patch: Partial<CalendarEvent> = {};
	if (data.title !== undefined) patch.title = data.title;
	if (data.start !== undefined) patch.start = data.start;
	if (data.end !== undefined) patch.end = data.end;
	if (data.allDay !== undefined) patch.allDay = data.allDay;
	if (data.location !== undefined) patch.location = data.location;
	if (data.description !== undefined) patch.description = data.description;
	if (data.recurrenceFrequency !== undefined) patch.recurrenceFrequency = data.recurrenceFrequency;
	if (data.recurrenceInterval !== undefined) patch.recurrenceInterval = data.recurrenceInterval;
	if (data.recurrenceByDay !== undefined) patch.recurrenceByDay = data.recurrenceByDay;
	if (data.recurrenceCount !== undefined) patch.recurrenceCount = data.recurrenceCount;
	if (data.recurrenceUntil !== undefined) patch.recurrenceUntil = data.recurrenceUntil;
	if (Object.keys(patch).length === 0) return;
	await tx.update(events).set(patch).where(eq(events.mirrorOf, masterId));
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
		.where(
			and(inArray(eventAttendance.eventId, eventIds), sql`${eventAttendance.userId} IS NOT NULL`)
		);

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

/**
 * First names for a set of event ownerIds, keyed by user id — ONE query for
 * the whole set (no N+1). Owners without a users row (deleted cascade edge)
 * have no entry.
 */
export async function getCreatorFirstNames(ownerIds: string[]) {
	if (ownerIds.length === 0) return new Map<string, string>();
	const rows = await db
		.select({ id: users.id, firstName: users.firstName })
		.from(users)
		.where(inArray(users.id, ownerIds));
	return new Map(rows.map((r) => [r.id, r.firstName]));
}

/** The shifted slot key and start/end overrides of one exception. */
export interface ShiftedExceptionSlots {
	originalDate: string;
	start: string | null;
	end: string | null;
}

function shiftBy(deltaMs: number, v: string): string;
function shiftBy(deltaMs: number, v: string | null): string | null;
function shiftBy(deltaMs: number, v: string | null): string | null {
	return v == null ? null : new Date(new Date(v).getTime() + deltaMs).toISOString();
}

/** Shift one Exception Override's slot key + start/end by the master shift. */
export function shiftException(
	exception: { originalDate: string; start: string | null; end: string | null },
	deltaMs: number
): ShiftedExceptionSlots {
	return {
		originalDate: shiftBy(deltaMs, exception.originalDate),
		start: shiftBy(deltaMs, exception.start),
		end: shiftBy(deltaMs, exception.end)
	};
}

/** Delete an event the user owns OR one living on an accessible calendar
 *  (personal or family) — mirrors the calendar's read scope. Any family-
 *  mirror copies (mirrorOf = id) go with the master in the SAME transaction
 *  so no ghost copy survives. Returns the number of rows actually deleted. */
export async function deleteEventInScope(id: string, userId: string, calendarIds: string[]) {
	return await db.transaction(async (tx) => {
		const removed = await tx
			.delete(events)
			.where(
				and(
					eq(events.id, id),
					or(
						eq(events.ownerId, userId),
						calendarIds.length > 0 ? inArray(events.calendarId, calendarIds) : sql`false`
					)
				)
			)
			.returning({ id: events.id });
		if (removed.length > 0) {
			// Belt-and-braces: the mirrorOf FK also cascades this at the DB
			// level; the explicit delete keeps the behavior visible and covered
			// by the scripted tests.
			await tx.delete(events).where(eq(events.mirrorOf, id));
		}
		return removed.length;
	});
}

export async function updateRsvp(
	eventId: string,
	userId: string,
	status: 'going' | 'maybe' | 'declined' | 'undecided'
) {
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
	return await db.select().from(eventAttendance).where(eq(eventAttendance.eventId, eventId));
}
