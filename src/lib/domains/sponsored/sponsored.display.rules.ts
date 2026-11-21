/**
 * sponsored display rules: the one projection every served Sponsored Event
 * goes through — every served row is generated (owner Q-040 B). The legacy
 * projection is `adService.ts:294-334`, `calendarData.ts:53-62,79-81`,
 * `+server.ts:35`.
 *
 * The row is the calendar display shape plus the ad marking: `📢 <message>`,
 * all-day, no calendar (`calendarId: ''`, so no person can be attributed to it
 * and no person filter hides it), `end` and `date` equal to `start`, the amber
 * and `isAd: true` — so no consumer can render a Sponsored Event unlabelled.
 *
 * `created_at` is the month window's start (owner Q-042 B), passed by the
 * service: stable for every read of the same month.
 *
 * Doc: ./README.md#invariants
 */
import { toInstantString } from '$lib/kernel/time/dates';
import type { SponsoredEvent } from './sponsored.contract';

/** The marker every served title starts with (#067); the projection writes it. */
export const SPONSORED_TITLE_MARKER = '📢';

/**
 * Sponsored Events render in this amber on the wire and on every calendar view
 * (#067). It lives with the projection that writes it, not in the contract, so
 * `index.ts` can hand a screen the amber without pulling the zod wire schemas
 * into the browser bundle; the contract imports it to pin the wire literal.
 */
export const SPONSORED_EVENT_COLOR = '#f59e0b';

/** What a served row is built from: a generated plan plus its id. */
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
	/** Served as `created_at`: the served month's start (Q-042 B). */
	readonly createdAt: Date;
};

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
