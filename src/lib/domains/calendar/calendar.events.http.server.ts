/**
 * calendar events http: the seven `/api` handlers over the event, rsvp and
 * `.ics` services.
 *
 * The stem is frozen by `calendar.events.http.db.test.ts` (R13), which imports
 * the route files and pins status + body of every one of them. Reproduces the
 * legacy wire exactly — auth mode, statuses, bodies, error copy — with no SQL
 * and no rules: the services own both.
 *
 * Four legacy quirks are kept on purpose, each pinned by that golden:
 * - `POST`/`PUT /api/events` read `await request.json()` BEFORE the handler's
 *   error boundary (`+server.ts:83`, `[id]/+server.ts:21`), so a body that is
 *   not JSON REJECTS instead of answering 400. The clone read below keeps that
 *   throw outside `endpoint()`'s try; the handle then parses the untouched
 *   original.
 * - `DELETE /api/events/[id]` reads `await request.json().catch(() => ({}))`, so
 *   a missing or unparseable body means the whole series.
 * - `POST /api/events/[id]/rsvp` dispatches on `guest !== undefined` (a present
 *   guest wins over `status`) and validates inside the service, after access.
 * - `GET /api/events/[id]/ics` answers PLAIN TEXT on every error and
 *   `text/calendar` on success, so its endpoint checks the actor itself
 *   (`auth: 'optional'`) and renders the service's `AppError`s as text.
 *
 * Doc: ./README.md#public-interface
 */
import type { EventRow } from '$lib/kernel/db/tables.server';
import { isAppError } from '$lib/kernel/errors/appError';
import { created, endpoint, ok, reply, type Endpoint } from '$lib/kernel/http/endpoint.server';
import {
	CALENDAR_COPY,
	type CalendarEventCreateBody,
	type CalendarEventDeleteBody,
	type CalendarEventRowWire,
	type CalendarEventUpdateBody,
	type CalendarRsvpBody
} from './calendar.contract';
import {
	createEvent,
	deleteEvent,
	listEventsInWindow,
	updateEvent
} from './calendar.events.service.server';
import { exportEventIcs } from './calendar.ics.service.server';
import { resolveEventRange } from './calendar.range.rules';
import { getEventAttendance, inviteEventGuest, rsvpEvent } from './calendar.rsvp.service.server';

/** The raw Event row on the wire: its `created_at` Date serializes as an ISO instant. */
function eventWire(row: EventRow): CalendarEventRowWire {
	return { ...row, created_at: row.created_at.toISOString() };
}

/**
 * Legacy read the request body BEFORE its `try` and then read properties off
 * it, so malformed JSON escaped the handler (the framework's 500) and a JSON
 * `null` body raised a `TypeError`, both instead of the endpoint's 400. A
 * clone read reproduces both throws; the original body stays unread for the
 * handler below. `calendar.bulk.http.server.ts` shares it for the same reason.
 */
export async function rejectUnparseableCalendarBody(request: Request): Promise<void> {
	const body: unknown = await request.clone().json();
	if (body === null) throw new TypeError('calendar: a JSON null body cannot be read');
}

// --- Events -------------------------------------------------------------------

/**
 * `GET /api/events?from&to`: the ranged read. `resolveEventRange` owns the
 * query contract and its three exact 400 messages.
 */
export const listEventsEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor, event }) => {
		const range = resolveEventRange(event.url.searchParams);
		if ('error' in range) return reply(400, { error: range.error });
		return ok(await listEventsInWindow(ctx, actor, range));
	}
});

/** `POST /api/events`: 201 `{success, event}` or the route's 500. */
const createEventHandler = endpoint({
	auth: 'user',
	failMessage: CALENDAR_COPY.failedToCreate,
	handle: async ({ ctx, actor, event }) => {
		// SAFETY: the legacy writer handed the parsed object straight on, so a
		// missing `title` is the DATABASE's refusal and the golden pins a 500.
		// The contract type is the seam here, not a runtime schema.
		const body = (await event.request.json()) as CalendarEventCreateBody;
		return created({ success: true, event: eventWire(await createEvent(ctx, actor, body)) });
	}
});

/** `POST /api/events`, with legacy's unguarded body read in front of the boundary. */
export const createEventEndpoint: Endpoint = {
	auth: 'user',
	handler: async (event) => {
		await rejectUnparseableCalendarBody(event.request);
		return createEventHandler.handler(event);
	}
};

/**
 * `PUT /api/events/[id]`: `200 {success, event}`, or the scope-`this` answer
 * `200 {success, note}`.
 */
const updateEventHandler = endpoint({
	auth: 'user',
	failMessage: CALENDAR_COPY.failedToUpdate,
	handle: async ({ ctx, actor, event }) => {
		// SAFETY: as on create — the service owns every refusal and lets the
		// database refuse a `title: null` (the golden pins that 500).
		const body = (await event.request.json()) as CalendarEventUpdateBody;
		const result = await updateEvent(ctx, actor, event.params.id ?? '', body);
		if (result.kind === 'series-note') {
			return ok({ success: true, note: CALENDAR_COPY.seriesNote });
		}
		return ok({ success: true, event: eventWire(result.event) });
	}
});

/** `PUT /api/events/[id]`, with legacy's unguarded body read in front of the boundary. */
export const updateEventEndpoint: Endpoint = {
	auth: 'user',
	handler: async (event) => {
		await rejectUnparseableCalendarBody(event.request);
		return updateEventHandler.handler(event);
	}
};

/** `DELETE /api/events/[id]`: always `200 {success:true}`; the scope lives in the body. */
export const deleteEventEndpoint = endpoint({
	auth: 'user',
	failMessage: CALENDAR_COPY.failedToDelete,
	handle: async ({ ctx, actor, event }) => {
		// SAFETY: legacy `await request.json().catch(() => ({}))` — an absent or
		// unparseable body reads as `{}`, i.e. the whole series.
		const body = (await event.request.json().catch(() => ({}))) as CalendarEventDeleteBody;
		await deleteEvent(ctx, actor, event.params.id ?? '', body);
		return ok({ success: true });
	}
});

// --- RSVP ---------------------------------------------------------------------

/** `GET /api/events/[id]/rsvp`: attendance, the viewer's answer and the guests. */
export const getEventRsvpEndpoint = endpoint({
	auth: 'user',
	failMessage: CALENDAR_COPY.failedToFetchAttendance,
	handle: async ({ ctx, actor, event }) =>
		ok(await getEventAttendance(ctx, actor, event.params.id ?? ''))
});

/** `POST .../rsvp` with a `status`: `{success, rsvpStatus, attendance}`. */
const setEventRsvpHandler = endpoint({
	auth: 'user',
	failMessage: CALENDAR_COPY.failedToUpdateRsvp,
	handle: async ({ ctx, actor, event }) => {
		// SAFETY: the service validates `status` and owns the 400 copy; the
		// schema would answer a different message for the same legacy leniency.
		const body = (await event.request.json()) as CalendarRsvpBody;
		return ok(await rsvpEvent(ctx, actor, event.params.id ?? '', body));
	}
});

/** `POST .../rsvp` with a `guest`: `{success, attendance}` and its own 500 copy. */
const inviteGuestHandler = endpoint({
	auth: 'user',
	failMessage: CALENDAR_COPY.failedToInviteGuest,
	handle: async ({ ctx, actor, event }) => {
		// SAFETY: as above — the service reads and validates `guest`.
		const body = (await event.request.json()) as CalendarRsvpBody;
		return ok(await inviteEventGuest(ctx, actor, event.params.id ?? '', body));
	}
});

/**
 * `POST /api/events/[id]/rsvp`: a present `guest` wins over `status`. The
 * dispatch reads a CLONE (legacy read the body before its `try`, so malformed
 * JSON escapes) and leaves the original body for the chosen handler, which
 * keeps its own 500 copy.
 */
export const setEventRsvpEndpoint: Endpoint = {
	auth: 'user',
	handler: async (event) => {
		const body = (await event.request.clone().json()) as CalendarRsvpBody;
		return body.guest !== undefined
			? inviteGuestHandler.handler(event)
			: setEventRsvpHandler.handler(event);
	}
};

// --- .ics ---------------------------------------------------------------------

/** The headers a successful download carries (legacy verbatim). */
function icsHeaders(filename: string): HeadersInit {
	return {
		'Content-Type': 'text/calendar; charset=utf-8',
		'Content-Disposition': `attachment; filename="${filename}"`
	};
}

/**
 * `GET /api/events/[id]/ics`: a master id or the composite occurrence id, as a
 * `text/calendar` attachment. READ access is enough (any viewer may export),
 * and every error — including the 401 — is plain text, so this handler checks
 * the actor itself and renders the service's `AppError`s as text.
 */
export const exportEventIcsEndpoint = endpoint({
	auth: 'optional',
	handle: async ({ ctx, actor, event }) => {
		if (!actor) return new Response(CALENDAR_COPY.unauthorized, { status: 401 });
		try {
			const file = await exportEventIcs(ctx, actor, { id: event.params.id ?? '' });
			return new Response(file.body, { status: 200, headers: icsHeaders(file.filename) });
		} catch (error) {
			if (isAppError(error)) return new Response(error.message, { status: error.status });
			const message = error instanceof Error ? error.message : String(error);
			const path = event.url.pathname;
			ctx.log.error('calendar_ics_export_failed', { path, message });
			ctx.faults.report({ status: 500, message, path, userId: actor.id });
			return new Response(CALENDAR_COPY.failedToExport, { status: 500 });
		}
	}
});
