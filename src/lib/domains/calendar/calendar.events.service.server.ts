/**
 * calendar event services: the ranged read (occurrence expansion, the day
 * split, rsvp/attendance/creator), Event create/update/delete with both access
 * legs, the Exception Override scopes, the family mirror and the ONE
 * `events_changed` nudge per mutating request.
 *
 * Ported from `src/routes/api/events/+server.ts`,
 * `src/routes/api/events/[id]/+server.ts`, `eventDisplayService.ts`,
 * `events.ts` (orchestration only — the queries are `calendar.repo.server.ts`)
 * and `eventsChangedNudge.ts`. Authorization lives here, never in the repo:
 * reads span every calendar the viewer can see (#098), whole-series writes and
 * the bare delete use the owner leg (#165), and a single-occurrence write
 * (`scope: 'this'`) needs read access only — the legacy gap kept as today.
 *
 * The nudge after every mutation is `calendar.calendars.service.server.ts`'s
 * `nudgeCalendarEventsChanged` — ONE home for the audience and the
 * unconfigured-FCM gate — called once per request, never awaited (legacy
 * `eventsChangedNudge.ts`).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx, type Db } from '$lib/kernel/db/database.server';
import type { CalendarRow, EventRow, NewEventRow } from '$lib/kernel/db/tables.server';
import { forbidden, invalid, notFound } from '$lib/kernel/errors/appError';
import { resolveMembershipFamilyId } from '$lib/domains/family/index.server';
import { getCalendarPreferences, getTimeZone } from '$lib/domains/identity/index.server';
import {
	listAccessibleCalendarIds,
	nudgeCalendarEventsChanged
} from './calendar.calendars.service.server';
import { splitEventsByDay } from './calendar.chips.rules';
import {
	CALENDAR_COPY,
	type CalendarAttendanceWire,
	type CalendarEventCreateBody,
	type CalendarEventDeleteBody,
	type CalendarEventUpdateBody,
	type EventAttendanceSummary
} from './calendar.contract';
import type { EventInvite } from './calendar.invites.rules';
import { resolveEventInvites } from './calendar.invites.service.server';
import {
	expandEventOccurrences,
	normalizeOccurrenceIso,
	resolveOccurrenceId,
	shiftException,
	type OccurrenceOf
} from './calendar.occurrence.rules';
import { eventRangeWindow, type EventRange } from './calendar.range.rules';
import { normalizeEventRecurrence } from './calendar.recurrence.rules';
import {
	deleteExceptionsForEvent,
	deleteEventRow,
	deleteMirrorRows,
	ensurePersonalCalendarRow,
	findCalendar,
	findEvent,
	findExceptions,
	findOwnedCalendarIds,
	findWindowEventRows,
	insertCreatorRsvp,
	insertEventRow,
	listAttendance,
	listCreatorNames,
	listFamilyCalendars,
	listRsvpStatuses,
	attendanceSummaries,
	replaceInvites,
	updateEventRow,
	updateExceptionRow,
	updateMirrorRows,
	upsertExceptionRow
} from './calendar.repo.server';
import { canMutateEventRow, isEventVisibleTo } from './calendar.scope.rules';

/** The ranged read's wire shape: the expanded occurrences plus the echoed range. */
export interface CalendarRangedEvents {
	readonly window: EventRange;
	readonly events: CalendarRangedEvent[];
}

/**
 * One occurrence as the ranged read answers it. Composite `id`, `masterId` and
 * `occurrenceDate` always travel together, and `date` is the viewer-zone day
 * the entry was split onto (a multi-day Event yields one entry per day, all
 * sharing the id). `rsvpStatus`/`attendance`/`creatorName` are absent — never
 * null — when there is nothing to say.
 */
export type CalendarRangedEvent = Omit<OccurrenceOf<EventRow>, 'created_at'> & {
	readonly created_at: string;
	readonly date: string;
	readonly rsvpStatus?: string;
	readonly attendance?: EventAttendanceSummary;
	readonly creatorName?: string;
};

/** What a `PUT` did: the updated series row, or the scope-`this` note. */
export type CalendarEventWriteResult =
	| { readonly kind: 'event'; readonly event: EventRow }
	| { readonly kind: 'series-note' };

/** The event detail screen's read model (`/calendar/event/[id]`). */
export interface CalendarEventDetail {
	readonly event: Omit<EventRow, 'start' | 'end'> & {
		readonly start: Date;
		readonly end: Date;
		readonly date: Date;
	};
	readonly calendar: CalendarRow | null;
	readonly attendance: readonly CalendarAttendanceWire[];
	readonly userRsvpStatus: string;
}

/**
 * `GET /api/events?from&to`: masters in start order (the rules bound their
 * expansion), one-offs overlapping the padded window, every Exception Override
 * applied, then the day split and the three per-master attachments. The
 * response order is the masters' order — NOT chronology.
 */
export async function listEventsInWindow(
	ctx: Ctx,
	actor: Actor,
	range: EventRange
): Promise<CalendarRangedEvents> {
	const bounds = eventRangeWindow(range);
	const accessibleCalendarIds = await listAccessibleCalendarIds(ctx, actor.id);

	const rows = await findWindowEventRows(ctx.db, {
		userId: actor.id,
		accessibleCalendarIds,
		startIso: bounds.startIso,
		endIso: bounds.endIso
	});

	const zone = (await getTimeZone(ctx, actor.id)) ?? 'utc';
	const exceptions = await findExceptions(
		ctx.db,
		rows.map((row) => row.id)
	);
	const occurrences = expandEventOccurrences(
		rows,
		exceptions,
		{ start: bounds.start, end: bounds.end },
		zone
	);
	const days = splitEventsByDay(occurrences, zone);

	const masterIds = [...new Set(days.map((day) => day.masterId))];
	const ownerIds = [...new Set(days.map((day) => day.ownerId))];
	const rsvpStatuses = await listRsvpStatuses(ctx.db, actor.id, masterIds);
	const summaries = await attendanceSummaries(ctx.db, masterIds);
	const creatorNames = await listCreatorNames(ctx.db, ownerIds);

	const rsvpByMaster = new Map(rsvpStatuses.map((row) => [row.eventId, row.status]));
	const events: CalendarRangedEvent[] = days.map((day) => {
		const summary = summaries.get(day.masterId);
		return {
			...day,
			start: day.start.toISOString(),
			end: day.end ? day.end.toISOString() : null,
			date: day.date.toISOString(),
			created_at: day.created_at.toISOString(),
			rsvpStatus: rsvpByMaster.get(day.masterId) ?? undefined,
			attendance: summary && summary.invited > 0 ? summary : undefined,
			creatorName: creatorNames.get(day.ownerId)
		};
	});

	return { window: range, events };
}

/**
 * `POST /api/events`: an inaccessible target calendar is a 403 before any
 * write; the Event, the creator's `going` RSVP, the invitations and the family
 * mirror commit in ONE transaction. `syncEventsToFamilyCalendar` mirrors onto
 * `listFamilyCalendars(...)[0]` — the legacy unordered pick, kept as today
 * (Q-043 makes the target and the "any calendar" rule a fix-in-port).
 */
export async function createEvent(
	ctx: Ctx,
	actor: Actor,
	body: CalendarEventCreateBody
): Promise<EventRow> {
	const invites = await resolveEventInvites(ctx, actor, body.attendees ?? body.attendants);

	if (body.calendarId) {
		const accessibleCalendarIds = await listAccessibleCalendarIds(ctx, actor.id);
		if (!accessibleCalendarIds.includes(body.calendarId)) {
			throw forbidden(CALENDAR_COPY.calendarNotAccessible);
		}
	}

	const created = await withTx(ctx, async (txCtx) => {
		let calendarId: string | null = body.calendarId ?? null;
		if (!calendarId) {
			const personal = await ensurePersonalCalendarRow(
				txCtx.db,
				actor.id,
				txCtx.clock.now()
			);
			if (!personal) throw new Error('No personal calendar available');
			calendarId = personal.id;
		}

		// SAFETY: the legacy writer handed the request body straight to the
		// insert, so a missing `title`/`start` is the DATABASE's refusal (the
		// golden pins a 500) — the wire type marks them optional and the cast
		// keeps that refusal at the insert instead of inventing a 400 here.
		const values = {
			calendarId,
			ownerId: actor.id,
			title: body.title,
			start: body.start,
			end: body.end || null,
			description: body.description || null,
			location: body.location || null,
			allDay: body.allDay || false,
			reminderMinutes: body.reminderMinutes ?? null,
			...normalizeEventRecurrence(body)
		} as NewEventRow;

		const createdEvent = await insertEventWithInvites(txCtx.db, values, actor.id, invites);

		const preferences = await getCalendarPreferences(txCtx, actor.id);
		if (preferences.syncEventsToFamilyCalendar) {
			const memberFamilyId = await resolveMembershipFamilyId(txCtx, actor.id);
			if (memberFamilyId) {
				const familyCalendars = await listFamilyCalendars(txCtx.db, memberFamilyId);
				const familyCalendar = familyCalendars[0];
				if (familyCalendar && familyCalendar.id !== calendarId) {
					await insertEventWithInvites(
						txCtx.db,
						{ ...values, calendarId: familyCalendar.id, mirrorOf: createdEvent.id },
						actor.id,
						invites
					);
				}
			}
		}

		return createdEvent;
	});

	void nudgeCalendarEventsChanged(ctx, actor, [created.calendarId]);
	return created;
}

/**
 * `PUT /api/events/[id]`: `id` may be a composite occurrence id. A `scope:
 * 'this'` write on a recurring master stores an Exception Override (read access
 * is enough, attendee edits land on the master series and the answer is the
 * series note); anything else is the whole series under the owner leg, with
 * the exception slots shifted by a start move and the fixed field set
 * propagated to every mirror row.
 */
export async function updateEvent(
	ctx: Ctx,
	actor: Actor,
	rawId: string,
	body: CalendarEventUpdateBody
): Promise<CalendarEventWriteResult> {
	const resolved = resolveOccurrenceId(rawId);
	if (!resolved) throw invalid(CALENDAR_COPY.invalidEventId);
	const eventId = resolved.masterId;

	// Only touch invitations when the caller actually sent attendee data.
	const hasInvites = Array.isArray(body.attendees) || Array.isArray(body.attendants);
	const invites = hasInvites
		? await resolveEventInvites(ctx, actor, body.attendees ?? body.attendants)
		: undefined;

	const existing = await findEvent(ctx.db, eventId);
	const accessibleCalendarIds = await listAccessibleCalendarIds(ctx, actor.id);
	if (!existing) throw notFound(CALENDAR_COPY.eventNotFound);

	if (body.scope === 'this' && existing.recurrenceFrequency) {
		if (!isEventVisibleTo(existing, actor.id, accessibleCalendarIds)) {
			throw forbidden(CALENDAR_COPY.eventNotAccessible);
		}
		// The occurrence is authoritative from the id the server generated;
		// `occurrenceDate` is only a compat fallback for a bare master id.
		const originalDate =
			resolved.occurrenceIso ??
			normalizeOccurrenceIso(isText(body.occurrenceDate) ? body.occurrenceDate : null);
		if (!originalDate) throw invalid(CALENDAR_COPY.occurrenceDateRequired);

		await upsertExceptionRow(ctx.db, {
			eventId,
			originalDate,
			isCancelled: false,
			title: body.title,
			description: body.description,
			location: body.location,
			start: body.start,
			end: body.end,
			allDay: body.allDay
		});
		// Attendee edits cannot be expressed per occurrence; they land on the
		// master series and the answer says so.
		if (hasInvites) await replaceInvites(ctx.db, eventId, invites ?? []);

		void nudgeCalendarEventsChanged(ctx, actor, [existing.calendarId]);
		return { kind: 'series-note' };
	}

	let calendarId = existing.calendarId;
	if (body.calendarId) {
		if (!accessibleCalendarIds.includes(body.calendarId)) {
			throw forbidden(CALENDAR_COPY.calendarNotAccessible);
		}
		calendarId = body.calendarId;
	}

	// #228: a partial body keeps the stored value for every key it omits; an
	// explicit null/'' still clears. Recurrence is NOT partial (Q-047): every
	// write funnels through normalizeEventRecurrence, so an omitted recurrence
	// clears the series.
	const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
	// SAFETY: as in createEvent, a `title: null` body is the DATABASE's refusal
	// (the golden pins a 500), so the patch keeps legacy's unvalidated values
	// and the cast carries them to the update.
	const patch = {
		title: has('title') ? body.title : existing.title,
		start: has('start') ? body.start : existing.start,
		end: has('end') ? body.end || null : existing.end,
		description: has('description') ? body.description || null : existing.description,
		location: has('location') ? body.location || null : existing.location,
		allDay: has('allDay') ? body.allDay || false : existing.allDay,
		calendarId,
		reminderMinutes: has('reminderMinutes')
			? (body.reminderMinutes ?? null)
			: existing.reminderMinutes,
		...normalizeEventRecurrence(body)
	} as Partial<NewEventRow>;

	const updated = await updateEventInScope(
		ctx,
		actor,
		eventId,
		patch,
		invites,
		accessibleCalendarIds
	);
	if (!updated) throw notFound(CALENDAR_COPY.eventNotFound);

	// #272: old + new calendar on a move.
	void nudgeCalendarEventsChanged(ctx, actor, [existing.calendarId, updated.calendarId]);
	return { kind: 'event', event: updated };
}

/**
 * `DELETE /api/events/[id]`: `scope: 'this'` on a recurring master cancels one
 * occurrence (read access is enough) and on a one-off deletes it; anything else
 * removes the master, every mirror copy and every override in one transaction
 * under the owner leg.
 */
export async function deleteEvent(
	ctx: Ctx,
	actor: Actor,
	rawId: string,
	body: CalendarEventDeleteBody
): Promise<void> {
	const resolved = resolveOccurrenceId(rawId);
	if (!resolved) throw invalid(CALENDAR_COPY.invalidEventId);
	const eventId = resolved.masterId;

	const accessibleCalendarIds = await listAccessibleCalendarIds(ctx, actor.id);

	if (body.scope === 'this') {
		const existing = await findEvent(ctx.db, eventId);
		if (!existing) throw notFound(CALENDAR_COPY.eventNotFound);
		if (!isEventVisibleTo(existing, actor.id, accessibleCalendarIds)) {
			throw forbidden(CALENDAR_COPY.eventNotAccessible);
		}

		if (!existing.recurrenceFrequency) {
			const deletedCount = await deleteEventInScope(
				ctx,
				actor,
				eventId,
				accessibleCalendarIds
			);
			if (deletedCount === 0) throw notFound(CALENDAR_COPY.eventNotFound);
			void nudgeCalendarEventsChanged(ctx, actor, [existing.calendarId]);
			return;
		}

		const originalDate =
			resolved.occurrenceIso ??
			normalizeOccurrenceIso(isText(body.occurrenceDate) ? body.occurrenceDate : null);
		if (!originalDate) throw invalid(CALENDAR_COPY.occurrenceDateRequired);

		await upsertExceptionRow(ctx.db, {
			eventId,
			originalDate,
			isCancelled: true
		});
		void nudgeCalendarEventsChanged(ctx, actor, [existing.calendarId]);
		return;
	}

	const deletedCount = await deleteEventInScope(ctx, actor, eventId, accessibleCalendarIds);
	if (deletedCount === 0) throw notFound(CALENDAR_COPY.eventNotFound);
	await deleteExceptionsForEvent(ctx.db, eventId);
	void nudgeCalendarEventsChanged(ctx, actor, []);
}

/**
 * The event detail screen's read: 404 for an unknown id, 403 for a viewer who
 * is neither the owner nor on a calendar they can see, then the row with its
 * dates parsed, its calendar, the attendance and the viewer's own answer.
 */
export async function getEventForViewer(
	ctx: Ctx,
	actor: Actor,
	eventId: string
): Promise<CalendarEventDetail> {
	const event = await findEvent(ctx.db, eventId);
	if (!event) throw notFound(CALENDAR_COPY.eventNotFound);

	const accessibleCalendarIds = await listAccessibleCalendarIds(ctx, actor.id);
	if (!isEventVisibleTo(event, actor.id, accessibleCalendarIds)) {
		throw forbidden(CALENDAR_COPY.noAccessToEvent);
	}

	const calendar = event.calendarId ? await findCalendar(ctx.db, event.calendarId) : null;
	const attendance = await listAttendance(ctx.db, eventId);
	const mine = attendance.find((row) => row.userId === actor.id);

	return {
		event: {
			...event,
			start: new Date(event.start),
			end: new Date(event.end ?? event.start),
			date: new Date(event.start)
		},
		calendar,
		attendance,
		userRsvpStatus: mine?.status || 'undecided'
	};
}

/** Insert one Event row, its creator's `going` RSVP and its invitations. */
async function insertEventWithInvites(
	db: Db,
	values: NewEventRow,
	ownerId: string,
	invites: readonly EventInvite[]
): Promise<EventRow> {
	const created = await insertEventRow(db, values);
	await insertCreatorRsvp(db, created.id, ownerId);
	await replaceInvites(db, created.id, invites);
	return created;
}

/**
 * The whole-series write leg: visible AND owner-leg, then the patch, the
 * exception shift, the invites and the mirror — all in the caller's
 * transaction. Returns undefined when the row is missing or either leg refuses
 * (the handler answers the legacy 404).
 */
async function updateEventInScope(
	ctx: Ctx,
	actor: Actor,
	eventId: string,
	patch: Partial<NewEventRow>,
	invites: readonly EventInvite[] | undefined,
	accessibleCalendarIds: readonly string[]
): Promise<EventRow | undefined> {
	const ownedCalendarIds = await findOwnedCalendarIds(ctx.db, actor.id);
	return await withTx(ctx, async (txCtx) => {
		const existing = await findEvent(txCtx.db, eventId);
		if (!existing || !isEventVisibleTo(existing, actor.id, accessibleCalendarIds)) {
			return undefined;
		}
		if (!canMutateEventRow(existing, actor.id, ownedCalendarIds)) return undefined;

		const updated = await updateEventRow(txCtx.db, eventId, patch);

		// A whole-series move re-anchors every occurrence slot; overrides are
		// keyed to the ORIGINAL slot, so slot + start/end shift by the same
		// delta in this transaction (non-zero delta only).
		if (patch.start !== undefined && existing.recurrenceFrequency) {
			const deltaMs = new Date(patch.start).getTime() - new Date(existing.start).getTime();
			if (deltaMs !== 0) {
				const exceptions = await findExceptions(txCtx.db, [eventId]);
				for (const exception of exceptions) {
					await updateExceptionRow(
						txCtx.db,
						exception.id,
						shiftException(exception, deltaMs)
					);
				}
			}
		}

		if (updated) {
			if (invites !== undefined) await replaceInvites(txCtx.db, eventId, invites);
			await syncFamilyMirror(txCtx.db, eventId, patch);
		}
		return updated ?? undefined;
	});
}

/** The fixed field set a master edit propagates; `calendarId` is deliberately out. */
async function syncFamilyMirror(
	db: Db,
	masterId: string,
	patch: Partial<NewEventRow>
): Promise<void> {
	const mirror: Partial<NewEventRow> = {};
	if (patch.title !== undefined) mirror.title = patch.title;
	if (patch.start !== undefined) mirror.start = patch.start;
	if (patch.end !== undefined) mirror.end = patch.end;
	if (patch.allDay !== undefined) mirror.allDay = patch.allDay;
	if (patch.location !== undefined) mirror.location = patch.location;
	if (patch.description !== undefined) mirror.description = patch.description;
	if (patch.recurrenceFrequency !== undefined) mirror.recurrenceFrequency = patch.recurrenceFrequency;
	if (patch.recurrenceInterval !== undefined) mirror.recurrenceInterval = patch.recurrenceInterval;
	if (patch.recurrenceByDay !== undefined) mirror.recurrenceByDay = patch.recurrenceByDay;
	if (patch.recurrenceCount !== undefined) mirror.recurrenceCount = patch.recurrenceCount;
	if (patch.recurrenceUntil !== undefined) mirror.recurrenceUntil = patch.recurrenceUntil;
	if (Object.keys(mirror).length === 0) return;
	await updateMirrorRows(db, masterId, mirror);
}

/**
 * The bare delete's write leg (#165): removes the master and every mirror copy
 * in one transaction, and reports 0 when the row is missing or either leg
 * refuses.
 */
async function deleteEventInScope(
	ctx: Ctx,
	actor: Actor,
	eventId: string,
	accessibleCalendarIds: readonly string[]
): Promise<number> {
	const ownedCalendarIds = await findOwnedCalendarIds(ctx.db, actor.id);
	return await withTx(ctx, async (txCtx) => {
		const existing = await findEvent(txCtx.db, eventId);
		if (!existing || !isEventVisibleTo(existing, actor.id, accessibleCalendarIds)) return 0;
		if (!canMutateEventRow(existing, actor.id, ownedCalendarIds)) return 0;
		const removed = await deleteEventRow(txCtx.db, eventId);
		if (removed > 0) await deleteMirrorRows(txCtx.db, eventId);
		return removed;
	});
}

/** A string out of the request body (the writers read raw JSON). */
function isText(value: unknown): value is string {
	return typeof value === 'string';
}
