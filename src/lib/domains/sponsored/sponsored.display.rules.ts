/**
 * sponsored display rules: the one projection every served Sponsored Event
 * goes through, whether it is an own 📢 Event or a generated one
 * (`adService.ts:294-334`, `calendarData.ts:53-62,79-81`, `+server.ts:35`).
 *
 * The row is the calendar display shape plus the ad marking: `📢 <message>`,
 * all-day, no calendar (`calendarId: ''`, so no person can be attributed to it
 * and no person filter hides it), `end` and `date` equal to `start`, the amber
 * and `isAd: true` — so no consumer can render a Sponsored Event unlabelled.
 *
 * `created_at` is the serving instant the caller passes, one per response
 * (Q-042, ported as today). The decided fix B — the stored value for an own
 * row, the month start for a generated one — changes only what the service
 * passes as `createdAt`, not this rule.
 *
 * Doc: ./README.md#invariants
 */
import { toInstantString } from '$lib/kernel/time/dates';
import type { OwnedSponsoredEventRow, SponsoredEvent } from './sponsored.contract';
import { SPONSORED_TITLE_MARKER, sponsoredMessageOf } from './sponsored.serve.rules';

/**
 * Sponsored Events render in this amber on the wire and on every calendar view
 * (#067). It lives with the projection that writes it, not in the contract, so
 * `index.ts` can hand a screen the amber without pulling the zod wire schemas
 * into the browser bundle; the contract imports it to pin the wire literal.
 */
export const SPONSORED_EVENT_COLOR = '#f59e0b';

/** What a served row is built from: an own 📢 Event, or a generated plan plus its id. */
export type SponsoredEventSource = {
	readonly id: string;
	readonly message: string;
	/** `null` and `''` both serve as `''`. */
	readonly description: string | null;
	/** Any instant shape `kernel/time` reads: an ISO string or the driver's timestamptz text. */
	readonly start: string;
};

/** The facts one response stamps on every row it serves. */
export type SponsoredEventServing = {
	/** The requesting user: every served row is theirs (`adService.ts:310,328`). */
	readonly ownerId: string;
	/** Served as `created_at`. */
	readonly createdAt: Date;
};

/** An own 📢 Event as a served source: its message is the title without the marker, trimmed. */
export function sponsoredSourceOfRow(row: OwnedSponsoredEventRow): SponsoredEventSource {
	return {
		id: row.id,
		message: sponsoredMessageOf(row.title),
		description: row.description,
		start: row.start
	};
}

/**
 * The wire row. `start` is normalized to a UTC ISO instant; one that is not an
 * instant throws a `RangeError`, as the legacy `toISOString()` did.
 */
export function toSponsoredEvent(
	source: SponsoredEventSource,
	serving: SponsoredEventServing
): SponsoredEvent {
	const start = toInstantString(source.start);
	if (start === null) throw new RangeError(`Invalid time value: ${source.start}`);
	return {
		id: source.id,
		title: `${SPONSORED_TITLE_MARKER} ${source.message}`,
		description: source.description ?? '',
		start,
		end: start,
		allDay: true,
		calendarId: '',
		ownerId: serving.ownerId,
		location: null,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		created_at: serving.createdAt.toISOString(),
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		mirrorOf: null,
		date: start,
		color: SPONSORED_EVENT_COLOR,
		isAd: true
	};
}
