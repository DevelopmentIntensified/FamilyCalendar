/**
 * calendar repo: every query over `calendars`, `events`, `eventExceptions`,
 * `eventAttendance` (plus the declared read-only join into `users` for names).
 *
 * Takes `db: Db` first, contains no authorization and no business rules, and
 * never reads a clock: a write that stamps a row receives the caller's `now`.
 * "Not found" is `null`; a delete reports how many rows it removed.
 *
 * The viewer's family memberships are a `family` read, so the service passes
 * the family ids in rather than this file reaching into another module's table.
 * Reads keep the legacy ORDER BY exactly: only the window read and the print
 * read order (`start`); every other read stays unordered and its tests compare
 * sorted.
 *
 * Doc: ./README.md#invariants
 */
import { and, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import {
	calendars,
	eventAttendance,
	eventExceptions,
	events,
	users,
	type CalendarRow,
	type EventAttendanceRow,
	type EventExceptionRow,
	type EventRow,
	type NewCalendarRow,
	type NewEventRow
} from '$lib/kernel/db/tables.server';
import { toInstantString } from '$lib/kernel/time/dates';
import type { EventAttendanceSummary } from './calendar.contract';
import { dedupeKey, type UndoCandidate } from './calendar.import.rules';
import type { EventInvite } from './calendar.invites.rules';

/** The service's per-request scope sets. */
export interface CalendarScopeIds {
	readonly accessibleCalendarIds: readonly string[];
}

/** Where the ranged read looks: the viewer's scope and an ISO window. */
export interface WindowQuery extends CalendarScopeIds {
	readonly userId: string;
	readonly startIso: string;
	readonly endIso: string;
}

/** An Exception Override write; `undefined` means "keep the stored value". */
export interface ExceptionWrite {
	readonly eventId: string;
	readonly originalDate: string;
	readonly isCancelled?: boolean;
	readonly title?: string | null;
	readonly description?: string | null;
	readonly location?: string | null;
	readonly start?: string | null;
	readonly end?: string | null;
	readonly allDay?: boolean | null;
}

// --- Calendars --------------------------------------------------------------

/**
 * Ids of the calendars the viewer can see: their own plus the calendar(s) of
 * every family they belong to (#098). `familyIds` comes from `family`.
 */
export async function findAccessibleCalendarIds(
	db: Db,
	userId: string,
	familyIds: readonly string[]
): Promise<string[]> {
	const where =
		familyIds.length > 0
			? or(eq(calendars.ownerId, userId), inArray(calendars.familyId, [...familyIds]))
			: eq(calendars.ownerId, userId);
	const rows = await db.select({ id: calendars.id }).from(calendars).where(where);
	return rows.map((row) => row.id);
}

/** Ids of the calendars the viewer OWNS — the issue-165 write leg. */
export async function findOwnedCalendarIds(db: Db, userId: string): Promise<string[]> {
	const rows = await db
		.select({ id: calendars.id })
		.from(calendars)
		.where(eq(calendars.ownerId, userId));
	return rows.map((row) => row.id);
}

/**
 * Idempotently ensure the viewer's Personal Calendar (own + `familyId IS
 * NULL`), returning the existing-or-created row. `now` stamps a new row.
 */
export async function ensurePersonalCalendarRow(
	db: Db,
	userId: string,
	now: Date
): Promise<CalendarRow | null> {
	const [existing] = await db
		.select()
		.from(calendars)
		.where(and(eq(calendars.ownerId, userId), isNull(calendars.familyId)));
	if (existing) return existing;
	const [created] = await db
		.insert(calendars)
		.values({ ownerId: userId, createdAt: now })
		.returning();
	return created ?? null;
}

export async function findCalendar(db: Db, calendarId: string): Promise<CalendarRow | null> {
	const [row] = await db.select().from(calendars).where(eq(calendars.id, calendarId));
	return row ?? null;
}

/** The calendars behind a set of ids (the `events_changed` audience read). */
export async function findCalendars(
	db: Db,
	calendarIds: readonly string[]
): Promise<CalendarRow[]> {
	if (calendarIds.length === 0) return [];
	return await db.select().from(calendars).where(inArray(calendars.id, [...calendarIds]));
}

/** Insert one calendar row (family creation goes through the family port). */
export async function insertCalendarRow(
	db: Db,
	values: NewCalendarRow
): Promise<CalendarRow> {
	const [row] = await db.insert(calendars).values(values).returning();
	if (!row) throw new Error('insertCalendarRow: insert returned no row');
	return row;
}

/** Every calendar owned by the viewer (the import picker's personal rows). */
export async function listOwnedCalendars(db: Db, userId: string): Promise<CalendarRow[]> {
	return await db.select().from(calendars).where(eq(calendars.ownerId, userId));
}

/** Every calendar of one family (unordered, as the legacy reads were). */
export async function listFamilyCalendars(
	db: Db,
	familyId: string
): Promise<CalendarRow[]> {
	return await db.select().from(calendars).where(eq(calendars.familyId, familyId));
}

// --- Events -----------------------------------------------------------------

export async function findEvent(db: Db, id: string): Promise<EventRow | null> {
	const [row] = await db.select().from(events).where(eq(events.id, id));
	return row ?? null;
}

/**
 * The ranged read's rows: every recurring master (the rule bounds expansion),
 * plus the one-offs that OVERLAP the window (`start < end` and (`end >= start`
 * or, with no end, `start >= start`)), in master-start order.
 */
export async function findWindowEventRows(db: Db, query: WindowQuery): Promise<EventRow[]> {
	const access =
		query.accessibleCalendarIds.length > 0
			? or(
					eq(events.ownerId, query.userId),
					inArray(events.calendarId, [...query.accessibleCalendarIds])
				)
			: or(eq(events.ownerId, query.userId), sql`false`);
	return await db
		.select()
		.from(events)
		.where(
			and(
				access,
				or(
					isNotNull(events.recurrenceFrequency),
					and(
						lte(events.start, query.endIso),
						or(
							gte(events.end, query.startIso),
							and(isNull(events.end), gte(events.start, query.startIso))
						)
					)
				)
			)
		)
		.orderBy(events.start);
}

/**
 * The archive read's rows: every Event on ONE calendar that started at or
 * before `beforeIso`, in start order. No occurrence expansion and no window
 * upper bound — the archive shows the masters as they were entered, which is
 * why a moved occurrence still appears at its original time (#292 G16).
 */
export async function findArchivedEventRows(
	db: Db,
	query: { readonly calendarId: string; readonly beforeIso: string }
): Promise<EventRow[]> {
	return await db
		.select()
		.from(events)
		.where(and(eq(events.calendarId, query.calendarId), lte(events.start, query.beforeIso)))
		.orderBy(events.start);
}

/**
 * Ids among `eventIds` the viewer may read: their own Events plus Events on a
 * calendar they can see (the bulk edit's editable set).
 */
export async function findAccessibleEventIds(
	db: Db,
	eventIds: readonly string[],
	userId: string,
	accessibleCalendarIds: readonly string[]
): Promise<string[]> {
	if (eventIds.length === 0) return [];
	const access = or(
		eq(events.ownerId, userId),
		accessibleCalendarIds.length > 0
			? inArray(events.calendarId, [...accessibleCalendarIds])
			: sql`false`
	);
	const rows = await db
		.select({ id: events.id })
		.from(events)
		.where(and(inArray(events.id, [...eventIds]), access));
	return rows.map((row) => row.id);
}

/** One calendar's events in start order (the printable month's read). */
export async function listEventsByCalendar(db: Db, calendarId: string): Promise<EventRow[]> {
	return await db.select().from(events).where(eq(events.calendarId, calendarId)).orderBy(events.start);
}

/** The fields the smart bulk planner reads off each selected Event. */
export interface EventPlannerRow {
	readonly id: string;
	readonly title: string;
	readonly start: string;
	readonly location: string | null;
}

/** The planner's per-event summary rows, in the caller's id order. */
export async function listEventPlannerRows(
	db: Db,
	eventIds: readonly string[]
): Promise<EventPlannerRow[]> {
	if (eventIds.length === 0) return [];
	return await db
		.select({
			id: events.id,
			title: events.title,
			start: events.start,
			location: events.location
		})
		.from(events)
		.where(inArray(events.id, [...eventIds]));
}

export async function insertEventRow(db: Db, values: NewEventRow): Promise<EventRow> {
	const [row] = await db.insert(events).values(values).returning();
	if (!row) throw new Error('insertEventRow: insert returned no row');
	return row;
}

/** Apply a patch and return the updated row, or null when it vanished. */
export async function updateEventRow(
	db: Db,
	id: string,
	patch: Partial<NewEventRow>
): Promise<EventRow | null> {
	const [row] = await db.update(events).set(patch).where(eq(events.id, id)).returning();
	return row ?? null;
}

/** Delete one Event row; returns the number removed (0 or 1). */
export async function deleteEventRow(db: Db, id: string): Promise<number> {
	const removed = await db.delete(events).where(eq(events.id, id)).returning({ id: events.id });
	return removed.length;
}

/** Delete every family-mirror copy of a master; returns the number removed. */
export async function deleteMirrorRows(db: Db, masterId: string): Promise<number> {
	const removed = await db
		.delete(events)
		.where(eq(events.mirrorOf, masterId))
		.returning({ id: events.id });
	return removed.length;
}

/** Apply a master edit's fixed field set to every mirror row (no calendar move). */
export async function updateMirrorRows(
	db: Db,
	masterId: string,
	patch: Partial<NewEventRow>
): Promise<void> {
	await db.update(events).set(patch).where(eq(events.mirrorOf, masterId));
}

// --- Exception Overrides ----------------------------------------------------

/** Every override of the given masters (unordered, as the legacy read was). */
export async function findExceptions(
	db: Db,
	eventIds: readonly string[]
): Promise<EventExceptionRow[]> {
	if (eventIds.length === 0) return [];
	return await db
		.select()
		.from(eventExceptions)
		.where(inArray(eventExceptions.eventId, [...eventIds]));
}

/** One override by its slot; the input ISO is normalized to the shared form. */
export async function findException(
	db: Db,
	eventId: string,
	originalDateIso: string
): Promise<EventExceptionRow | null> {
	const originalDate = toInstantString(originalDateIso) ?? originalDateIso;
	const [row] = await db
		.select()
		.from(eventExceptions)
		.where(
			and(eq(eventExceptions.eventId, eventId), eq(eventExceptions.originalDate, originalDate))
		);
	return row ?? null;
}

/**
 * Select-then-write, matching legacy (racy without the unique index of #014).
 * Only defined fields are replaced; `isCancelled` defaults false and
 * `originalDate` is normalized to UTC ISO.
 */
export async function upsertExceptionRow(
	db: Db,
	data: ExceptionWrite
): Promise<EventExceptionRow> {
	const originalDate = toInstantString(data.originalDate) ?? data.originalDate;
	const existing = await findException(db, data.eventId, originalDate);
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
		if (!updated) throw new Error('upsertExceptionRow: update returned no row');
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
	if (!created) throw new Error('upsertExceptionRow: insert returned no row');
	return created;
}

/** Patch one override (the whole-series move shift uses this). */
export async function updateExceptionRow(
	db: Db,
	id: string,
	patch: Partial<Omit<EventExceptionRow, 'id'>>
): Promise<EventExceptionRow | null> {
	const [row] = await db
		.update(eventExceptions)
		.set(patch)
		.where(eq(eventExceptions.id, id))
		.returning();
	return row ?? null;
}

/** Remove every override of an event (the whole-series delete's cleanup). */
export async function deleteExceptionsForEvent(db: Db, eventId: string): Promise<number> {
	const removed = await db
		.delete(eventExceptions)
		.where(eq(eventExceptions.eventId, eventId))
		.returning({ id: eventExceptions.id });
	return removed.length;
}

// --- Attendance -------------------------------------------------------------

/** The attendance rows plus the member's names (left join; guests have none). */
export async function listAttendance(db: Db, eventId: string) {
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
		.where(eq(eventAttendance.eventId, eventId));
}

/** All rows of an event without the name join (raw attendance). */
export async function listAttendanceRows(db: Db, eventId: string): Promise<EventAttendanceRow[]> {
	return await db.select().from(eventAttendance).where(eq(eventAttendance.eventId, eventId));
}

/** Guest names on an event, in stored order (the bulk merge's read). */
export async function listGuestNames(db: Db, eventId: string): Promise<string[]> {
	const rows = await db
		.select({ name: eventAttendance.name })
		.from(eventAttendance)
		.where(eq(eventAttendance.eventId, eventId));
	return rows.flatMap((row) => (row.name ? [row.name] : []));
}

/** Remove every guest row of an event (members are untouched). */
export async function deleteGuestRows(db: Db, eventId: string): Promise<number> {
	const removed = await db
		.delete(eventAttendance)
		.where(and(eq(eventAttendance.eventId, eventId), sql`${eventAttendance.name} IS NOT NULL`))
		.returning({ id: eventAttendance.id });
	return removed.length;
}

/** Insert named guests as `undecided`, always optional. */
export async function insertGuestRows(
	db: Db,
	eventId: string,
	names: readonly string[]
): Promise<void> {
	if (names.length === 0) return;
	await db.insert(eventAttendance).values(
		names.map((name) => ({
			eventId,
			name,
			status: 'undecided' as const,
			inviteType: 'optional' as const
		}))
	);
}

/**
 * Full re-sync of an event's invitations.
 *
 * - Member rows: upserted with the given inviteType, preserving any RSVP.
 *   Members no longer invited who have not responded are dropped; members who
 *   responded keep their row (downgraded to optional).
 * - Guest rows: all replaced by the provided names.
 * - The creator's own `going` row is never deleted.
 */
export async function replaceInvites(
	db: Db,
	eventId: string,
	invites: readonly EventInvite[]
): Promise<void> {
	const existing = await db
		.select({
			id: eventAttendance.id,
			userId: eventAttendance.userId,
			name: eventAttendance.name,
			status: eventAttendance.status,
			inviteType: eventAttendance.inviteType
		})
		.from(eventAttendance)
		.where(eq(eventAttendance.eventId, eventId));

	const confirmedType = (type?: string | null): 'required' | 'optional' =>
		type === 'required' ? 'required' : 'optional';

	const userRows = existing.filter((row) => row.userId);
	const byUser = new Map(userRows.map((row) => [row.userId, row]));
	const requested = new Set<string>();
	for (const invite of invites) {
		if (!invite.userId) continue;
		if (requested.has(invite.userId)) continue;
		requested.add(invite.userId);
		const type = confirmedType(invite.inviteType);
		const row = byUser.get(invite.userId);
		if (row) {
			if (row.inviteType !== type) {
				await db
					.update(eventAttendance)
					.set({ inviteType: type })
					.where(eq(eventAttendance.id, row.id));
			}
		} else {
			await db.insert(eventAttendance).values({
				eventId,
				userId: invite.userId,
				status: 'undecided',
				inviteType: type
			});
		}
	}
	for (const row of userRows) {
		if (row.userId && !requested.has(row.userId)) {
			if (row.status === 'undecided') {
				await db.delete(eventAttendance).where(eq(eventAttendance.id, row.id));
			} else if (row.inviteType === 'required') {
				await db
					.update(eventAttendance)
					.set({ inviteType: 'optional' })
					.where(eq(eventAttendance.id, row.id));
			}
		}
	}

	await deleteGuestRows(db, eventId);
	const guests = invites.flatMap((invite) =>
		invite.name && invite.name.trim() ? [invite.name.trim()] : []
	);
	await insertGuestRows(db, eventId, guests);
}

/** The creator's auto-RSVP row (`going`, optional). */
export async function insertCreatorRsvp(db: Db, eventId: string, userId: string): Promise<void> {
	await db.insert(eventAttendance).values({
		eventId,
		userId,
		status: 'going',
		inviteType: 'optional'
	});
}

/**
 * Upsert the viewer's RSVP against the partial unique index. The arbiter is
 * `(event_id, user_id) WHERE user_id IS NOT NULL`, so the conflict target
 * carries that predicate too.
 */
export async function upsertRsvp(
	db: Db,
	eventId: string,
	userId: string,
	status: string
): Promise<void> {
	await db
		.insert(eventAttendance)
		.values({ eventId, userId, status })
		.onConflictDoUpdate({
			target: [eventAttendance.eventId, eventAttendance.userId],
			targetWhere: sql`${eventAttendance.userId} IS NOT NULL`,
			set: { status }
		});
}

/** The viewer's status per master event id (unordered). */
export async function listRsvpStatuses(
	db: Db,
	userId: string,
	eventIds: readonly string[]
): Promise<{ eventId: string; status: string | null }[]> {
	if (eventIds.length === 0) return [];
	return await db
		.select({ eventId: eventAttendance.eventId, status: eventAttendance.status })
		.from(eventAttendance)
		.where(
			and(inArray(eventAttendance.eventId, [...eventIds]), eq(eventAttendance.userId, userId))
		);
}

/**
 * Compact per-master "who's going" summary (member rows only — guests never
 * appear). Unordered rows, keyed by event id.
 */
export async function attendanceSummaries(
	db: Db,
	eventIds: readonly string[]
): Promise<Map<string, EventAttendanceSummary>> {
	if (eventIds.length === 0) return new Map();
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
			and(inArray(eventAttendance.eventId, [...eventIds]), sql`${eventAttendance.userId} IS NOT NULL`)
		);

	const summaries = new Map<string, EventAttendanceSummary>();
	for (const row of rows) {
		let summary = summaries.get(row.eventId);
		if (!summary) {
			summary = { going: 0, invited: 0, required: 0, requiredPending: 0, goingNames: [] };
			summaries.set(row.eventId, summary);
		}
		summary.invited += 1;
		if (row.inviteType === 'required') {
			summary.required += 1;
			if (row.status !== 'going') summary.requiredPending += 1;
		}
		if (row.status === 'going') {
			summary.going += 1;
			if (row.firstName) summary.goingNames.push(row.firstName);
		}
	}
	return summaries;
}

/** First names for a set of event owner ids, one query for the whole set. */
export async function listCreatorNames(
	db: Db,
	ownerIds: readonly string[]
): Promise<Map<string, string>> {
	if (ownerIds.length === 0) return new Map();
	const rows = await db
		.select({ id: users.id, firstName: users.firstName })
		.from(users)
		.where(inArray(users.id, [...ownerIds]));
	return new Map(rows.map((row) => [row.id, row.firstName]));
}

// --- Import -----------------------------------------------------------------

/** Dedupe keys already on one calendar (lowercased title + exact start ISO). */
export async function listExistingDedupeKeys(db: Db, calendarId: string): Promise<string[]> {
	const rows = await db
		.select({ title: events.title, start: events.start })
		.from(events)
		.where(eq(events.calendarId, calendarId));
	return rows.map((row) => dedupeKey(row.title, new Date(row.start).toISOString()));
}

/**
 * The rows an undo batch may touch: these ids, this viewer AND this calendar.
 * An id that fails either test never comes back.
 */
export async function listUndoCandidates(
	db: Db,
	ids: readonly string[],
	userId: string,
	calendarId: string
): Promise<UndoCandidate[]> {
	if (ids.length === 0) return [];
	const rows = await db
		.select({ id: events.id, title: events.title, start: events.start })
		.from(events)
		.where(
			and(
				inArray(events.id, [...ids]),
				eq(events.ownerId, userId),
				eq(events.calendarId, calendarId)
			)
		);
	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		startIso: new Date(row.start).toISOString()
	}));
}

/**
 * Delete the batch under the same predicate the read used; mirror copies go
 * with their master. Returns the number of masters removed.
 */
export async function deleteImportedRows(
	db: Db,
	ids: readonly string[],
	userId: string,
	calendarId: string
): Promise<number> {
	if (ids.length === 0) return 0;
	const removed = await db
		.delete(events)
		.where(
			and(
				inArray(events.id, [...ids]),
				eq(events.ownerId, userId),
				eq(events.calendarId, calendarId)
			)
		)
		.returning({ id: events.id });
	const removedIds = removed.map((row) => row.id);
	if (removedIds.length > 0) {
		await db.delete(events).where(inArray(events.mirrorOf, removedIds));
	}
	return removedIds.length;
}

/**
 * Moves every Event one person owns onto another person and one calendar —
 * the guest merge (`guestMergeService.ts:67-72`). Ids are preserved untouched
 * (checklist links survive), and mirror rows move like their masters: the
 * legacy update had no `mirrorOf` filter either.
 */
export async function moveEventsOwnedBy(
	db: Db,
	input: { readonly from: string; readonly to: string; readonly calendarId: string }
): Promise<number> {
	const moved = await db
		.update(events)
		.set({ ownerId: input.to, calendarId: input.calendarId })
		.where(eq(events.ownerId, input.from))
		.returning({ id: events.id });
	return moved.length;
}

/** How many Events one person owns — the `/merge-guest` prompt's count. */
export async function countEventsOwnedBy(db: Db, ownerId: string): Promise<number> {
	const rows = await db
		.select({ id: events.id })
		.from(events)
		.where(eq(events.ownerId, ownerId));
	return rows.length;
}
