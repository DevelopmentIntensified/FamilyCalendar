/**
 * calendar bulk http: the four remaining `/api` handlers — the bulk edit, the
 * calendar picker, the printable month and the location search.
 *
 * The stem is frozen by `calendar.bulk.http.db.test.ts` (R13), which pins all
 * four. Reproduces the legacy wire exactly: statuses, bodies, copy and the
 * location search's rate-limit scope (`location-search:<ip>`, the same bucket
 * legacy used). No SQL and no rules — `calendar.bulk.service.server.ts`,
 * `calendar.calendars.service.server.ts` and
 * `calendar.locations.service.server.ts` own them.
 *
 * `POST /api/events/bulk` keeps legacy's unguarded body read (it ran before
 * the handler's `try`), so the shared clone read rejects a malformed body
 * instead of answering 400; the bulk golden does not send one, but the events
 * golden pins the same quirk on create.
 *
 * Doc: ./README.md#public-interface
 */
import { endpoint, ok, type Endpoint } from '$lib/kernel/http/endpoint.server';
import { clientKeyOf } from '$lib/kernel/ratelimit/rateLimiter';
import { bulkEditEvents, type CalendarBulkInput } from './calendar.bulk.service.server';
import { getPrintMonth, listCalendars } from './calendar.calendars.service.server';
import { CALENDAR_COPY } from './calendar.contract';
import { rejectUnparseableCalendarBody } from './calendar.events.http.server';
import { searchLocations } from './calendar.locations.service.server';

/** `POST /api/events/bulk`: one id at a time, and ONE 500 copy for the batch. */
const bulkEditHandler = endpoint({
	auth: 'user',
	failMessage: CALENDAR_COPY.bulkFailed,
	handle: async ({ ctx, actor, event }) => {
		// SAFETY: the service reads `ids`/`op`/`plan`/`dryRun` leniently and owns
		// every 400/403/422 copy, exactly as the legacy handler did.
		const body = (await event.request.json()) as CalendarBulkInput;
		return ok(await bulkEditEvents(ctx, actor, body));
	}
});

/** `POST /api/events/bulk`, with legacy's unguarded body read in front of the boundary. */
export const bulkEditEventsEndpoint: Endpoint = {
	auth: 'user',
	handler: async (event) => {
		await rejectUnparseableCalendarBody(event.request);
		return bulkEditHandler.handler(event);
	}
};

/** `GET /api/calendars`: the viewer's calendars, personal first, named and coloured. */
export const listCalendarsEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => ok(await listCalendars(ctx, actor))
});

/**
 * `GET /api/print?year&month`: the printable month. The raw query values go
 * in; the service owns the "current month" default and the 1–12 clamp.
 */
export const printMonthEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor, event }) =>
		ok(
			await getPrintMonth(ctx, actor, {
				year: event.url.searchParams.get('year'),
				month: event.url.searchParams.get('month')
			})
		)
});

/**
 * `GET /api/location-search?q=`: at most five `{label, lat, lon}` suggestions.
 * The limiter runs inside the service BEFORE the query is read (legacy order),
 * and it is the same `${scope}:${ip}` bucket, so no endpoint-level `rateLimit`.
 */
export const searchLocationsEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor, event }) =>
		ok(
			await searchLocations(ctx, actor, {
				q: event.url.searchParams.get('q') ?? '',
				clientKey: clientKeyOf(event.request, 'location-search')
			})
		)
});
