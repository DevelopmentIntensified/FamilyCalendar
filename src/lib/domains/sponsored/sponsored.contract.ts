/**
 * sponsored contract: the zod schemas and types for `GET /api/sponsored-events`
 * (the query and the response) and the module's vocabulary types. Dates on the
 * wire are ISO strings, which is what the route and the golden carry.
 *
 * The wire row is the legacy calendar display shape plus the ad marking
 * (`adService.ts:276-334`, `calendarData.ts:53-62,79-81`, `+server.ts:35`).
 * Every calendar-only field is a fixed placeholder — `calendarId: ''` and the
 * location, recurrence, reminder and mirror fields `null` — `allDay` and
 * `isAd` are always `true` and the colour is always the amber, so the schema
 * states them as literals: a row that could render unlabelled does not parse.
 *
 * Doc: ./README.md#invariants
 */
import { isoInstant, yearMonth, z } from '$lib/kernel/validation/validators';
import { SPONSORED_CONSENT_DECISIONS } from './sponsored.consent.rules';
import { SPONSORED_EVENT_COLOR } from './sponsored.display.rules';

// --- Vocabularies -----------------------------------------------------------

/** What a consent record records: consent given, or consent withdrawn. */
export type SponsoredConsentDecision = (typeof SPONSORED_CONSENT_DECISIONS)[number];

// --- Wire copy --------------------------------------------------------------

/** The one 400 body for a `month` that is present but not `YYYY-MM` (month 01–12). */
export const SPONSORED_MONTH_INVALID_MESSAGE = 'Invalid month';

// --- `/api/sponsored-events` ------------------------------------------------

/**
 * `GET /api/sponsored-events?month=YYYY-MM`. An absent `month` is the current
 * month in the user's zone (the service resolves it); a present one must be
 * exactly `YYYY-MM` with month 01–12, so `2026-13`, `2026-00`, `2026-1`, `nov`,
 * `2026-11-01` and the empty value all answer `400 {"error":"Invalid month"}`
 * (`+server.ts:19-30`). Other query keys are ignored, as the legacy route did.
 */
export const SponsoredEventsQuery = z.object({
	month: yearMonth(SPONSORED_MONTH_INVALID_MESSAGE).optional()
});
export type SponsoredEventsQuery = z.infer<typeof SponsoredEventsQuery>;

/**
 * One served Sponsored Event: the row the wire and the calendar render.
 * `start`, `end` and `date` are the same instant (an all-day row); `created_at`
 * is the served month's start (owner Q-042 B), stable across requests.
 */
export const SponsoredEvent = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string(),
	start: isoInstant(),
	end: isoInstant(),
	allDay: z.literal(true),
	calendarId: z.literal(''),
	ownerId: z.string(),
	location: z.null(),
	recurrenceFrequency: z.null(),
	recurrenceInterval: z.null(),
	created_at: isoInstant(),
	recurrenceByDay: z.null(),
	recurrenceCount: z.null(),
	recurrenceUntil: z.null(),
	reminderMinutes: z.null(),
	mirrorOf: z.null(),
	date: isoInstant(),
	color: z.literal(SPONSORED_EVENT_COLOR),
	isAd: z.literal(true)
});
export type SponsoredEvent = z.infer<typeof SponsoredEvent>;

/** `200 {events}`; `{events: []}` when the serve gate is off. */
export const SponsoredEventsResponse = z.object({ events: z.array(SponsoredEvent) });
export type SponsoredEventsResponse = z.infer<typeof SponsoredEventsResponse>;
