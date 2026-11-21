/**
 * sponsored month rules: which month a request means, that month's window in
 * the user's zone, and the three generated Sponsored Events for a month that
 * has no own 📢 row.
 *
 * Nothing here reads the clock or a random generator (rule R5): `now`, the
 * zone and the random source are parameters. Generation is re-randomised on
 * every request today (Q-041, ported as today), so the service passes a fresh
 * source per request. The rule already takes the source as a parameter, so the
 * decided fix B — a source seeded from `sha256(userId + 'YYYY-MM')` — changes
 * only what the service passes, not this rule.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';

/** A calendar month: `month` is 1–12. */
export type SponsoredMonth = { readonly year: number; readonly month: number };

/** A uniform draw in [0, 1), the contract of the global random generator legacy used. */
export type SponsoredRandomSource = () => number;

/** One generated Sponsored Event before it gets an id: its message and start instant. */
export type SponsoredEventPlan = { readonly message: string; readonly start: string };

/** A month with no own 📢 row is served exactly this many generated Sponsored Events. */
export const SPONSORED_EVENTS_PER_MONTH = 3;

/** Generated Sponsored Events start at this local hour. */
const SPONSORED_EVENT_HOUR = 10;

/**
 * The generation templates' messages, in the legacy draw order
 * (`AD_TEMPLATES`, `adService.ts:34-63`). Only the message reaches the wire;
 * the templates' sponsor, call-to-action and target plan never did.
 */
export const SPONSORED_EVENT_MESSAGES = [
	'Upgrade to Premium and unlock unlimited family members!',
	'Get 20% off annual plans this month only!',
	'Check out our new archive retention feature - preserve memories forever!',
	'Invite your extended family - groups now support 5+ members!'
] as const;

/** The month a validated `YYYY-MM` key names (the contract has already checked it). */
export function sponsoredMonthOfKey(key: string): SponsoredMonth {
	return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
}

/** The current month in `zone`, for a request without `month` (`+server.ts:22-25`). */
export function sponsoredMonthOf({
	now,
	zone
}: {
	readonly now: Date;
	readonly zone: string;
}): SponsoredMonth {
	const local = DateTime.fromJSDate(now, { zone });
	return { year: local.year, month: local.month };
}

/**
 * The month as a window of instants: local midnight on the 1st in `zone`, up
 * to (not including) the next month's (`adService.ts:93-95`). The own-row read
 * matches `events.start` against it, so a row at 05:00Z on 1 November is
 * October's in Honolulu.
 */
export function sponsoredMonthWindow({
	month,
	zone
}: {
	readonly month: SponsoredMonth;
	readonly zone: string;
}): { readonly fromIso: string; readonly toIso: string } {
	const start = DateTime.fromObject(
		{ year: month.year, month: month.month, day: 1 },
		{ zone }
	).startOf('month');
	return {
		fromIso: start.toJSDate().toISOString(),
		toIso: start.plus({ months: 1 }).toJSDate().toISOString()
	};
}

/**
 * The month's generated Sponsored Events (`adService.ts:126-183`). For each of
 * the three: draw a template as `floor(random() × 4)`, drawing again while it
 * was already used (and an unused one remains), then draw the day as
 * `floor(random() × daysInMonth) + 1`; the event starts at 10:00 local on that
 * day. Templates never repeat within a month; days may. The draw order is the
 * legacy one, so a scripted source pins every value.
 */
export function planSponsoredMonth({
	month,
	zone,
	random
}: {
	readonly month: SponsoredMonth;
	readonly zone: string;
	readonly random: SponsoredRandomSource;
}): SponsoredEventPlan[] {
	const daysInMonth =
		DateTime.fromObject({ year: month.year, month: month.month }, { zone }).daysInMonth ?? 30;
	const used: number[] = [];
	const plans: SponsoredEventPlan[] = [];
	for (let i = 0; i < SPONSORED_EVENTS_PER_MONTH; i++) {
		let index: number;
		do {
			index = Math.floor(random() * SPONSORED_EVENT_MESSAGES.length);
		} while (used.includes(index) && used.length < SPONSORED_EVENT_MESSAGES.length);
		used.push(index);
		const day = Math.floor(random() * daysInMonth) + 1;
		const start = DateTime.fromObject(
			{ year: month.year, month: month.month, day, hour: SPONSORED_EVENT_HOUR },
			{ zone }
		)
			.toJSDate()
			.toISOString();
		plans.push({ message: SPONSORED_EVENT_MESSAGES[index], start });
	}
	return plans;
}
