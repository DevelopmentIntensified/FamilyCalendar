/**
 * calendar rsvp services: the attendance read, the viewer's RSVP upsert and
 * the named-guest invite, ported from `src/routes/api/events/[id]/rsvp/
 * +server.ts` and `events.ts` (`updateRsvp`, `getEventRsvpStatus`,
 * `getEventAttendance`, `addEventAttendants`).
 *
 * The pair needs READ access only (`canTouchEvent`), and both look `id` up in
 * `events` with no occurrence resolution — a composite `master~ISO` id is "not
 * found", unlike PUT/DELETE/ics (pinned as today by the golden).
 *
 * `rsvpStatus` carries the raw attendance ROWS, not a status string (Q-046,
 * pinned); `attendance` is the same rows joined to member names. A guest is an
 * attendance row with no account behind it: trimmed, never added twice
 * (case-insensitive), always optional. Attendance is stored per MASTER, so the
 * reply reflects the whole series.
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { forbidden, invalid, notFound } from '$lib/kernel/errors/appError';
import {
	CALENDAR_COPY,
	RSVP_STATUSES,
	type CalendarAttendanceWire,
	type CalendarGuestInvitedResponse,
	type CalendarRsvpBody,
	type CalendarRsvpResponse,
	type CalendarRsvpUpdatedResponse,
	type RsvpStatus
} from './calendar.contract';
import {
	findEvent,
	insertGuestRows,
	listAttendance,
	listAttendanceRows,
	upsertRsvp
} from './calendar.repo.server';
import { eventTouchDecision } from './calendar.scope.rules';
import { listAccessibleCalendarIds } from './calendar.events.service.server';

/**
 * `GET /api/events/[id]/rsvp`: every attendance row with its member names, the
 * viewer's own answer (`undecided` with no row) and the guests' names.
 */
export async function getEventAttendance(
	ctx: Ctx,
	actor: Actor,
	eventId: string
): Promise<CalendarRsvpResponse> {
	await assertEventAccess(ctx, actor, eventId);

	const attendance = await listAttendance(ctx.db, eventId);
	const mine = attendance.find((row) => row.userId === actor.id);
	return {
		attendance,
		userRsvpStatus: mine?.status || 'undecided',
		nonUserAttendants: guestNamesOf(attendance)
	};
}

/**
 * `POST /api/events/[id]/rsvp` with a `status`: one upsert against the partial
 * unique index (`user_id IS NOT NULL`), then the raw rows and the joined rows.
 * Anything outside the four answers is a 400.
 */
export async function rsvpEvent(
	ctx: Ctx,
	actor: Actor,
	eventId: string,
	body: CalendarRsvpBody
): Promise<CalendarRsvpUpdatedResponse> {
	await assertEventAccess(ctx, actor, eventId);

	const status = body.status;
	if (!isRsvpStatus(status)) throw invalid(CALENDAR_COPY.invalidRsvpStatus);

	await upsertRsvp(ctx.db, eventId, actor.id, status);
	const rsvpStatus = await listAttendanceRows(ctx.db, eventId);
	const attendance = await listAttendance(ctx.db, eventId);
	return { success: true, rsvpStatus, attendance };
}

/**
 * `POST /api/events/[id]/rsvp` with a `guest`: a blank or non-string name is a
 * 400, a name already on the event (case-insensitive, trimmed) is not added
 * twice, and the answer carries no `rsvpStatus` field at all.
 */
export async function inviteEventGuest(
	ctx: Ctx,
	actor: Actor,
	eventId: string,
	body: CalendarRsvpBody
): Promise<CalendarGuestInvitedResponse> {
	await assertEventAccess(ctx, actor, eventId);

	const name = isGuestName(body.guest) ? body.guest.trim() : '';
	if (!name) throw invalid(CALENDAR_COPY.guestNameRequired);

	const attendance = await listAttendance(ctx.db, eventId);
	const alreadyThere = attendance.some(
		(row) => !row.userId && (row.name ?? '').trim().toLowerCase() === name.toLowerCase()
	);
	if (!alreadyThere) await insertGuestRows(ctx.db, eventId, [name]);

	const refreshed = await listAttendance(ctx.db, eventId);
	return { success: true, attendance: refreshed };
}

/** 404 when the Event is missing, 403 when the viewer may not read it. */
async function assertEventAccess(ctx: Ctx, actor: Actor, eventId: string): Promise<void> {
	const decision = eventTouchDecision(
		await findEvent(ctx.db, eventId),
		actor.id,
		await listAccessibleCalendarIds(ctx, actor.id)
	);
	if (decision === 'not-found') throw notFound(CALENDAR_COPY.eventNotFound);
	if (decision === 'forbidden') throw forbidden(CALENDAR_COPY.noAccessToEvent);
}

/** The guest names on the attendance read, in stored order. */
function guestNamesOf(attendance: readonly CalendarAttendanceWire[]): string[] {
	return attendance.flatMap((row) => (!row.userId && row.name ? [row.name] : []));
}

/** True for one of the four RSVP answers. */
function isRsvpStatus(value: string | undefined): value is RsvpStatus {
	return value !== undefined && RSVP_STATUSES.some((known) => known === value);
}

/** True only for a string guest name; every other JSON type is "no name". */
function isGuestName(value: unknown): value is string {
	return typeof value === 'string';
}
