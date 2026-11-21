/**
 * sponsored month rules: which month a request means, that month's window in
 * the user's zone, and the three Sponsored Events the module generates for it
 * (owner Q-040 B: the generated month is the sole source).
 *
 * Nothing here reads the clock or a global random generator (rule R5): `now`,
 * the zone and the draw's source are parameters. The source is seeded from
 * `sha256(userId + 'YYYY-MM')` (owner Q-041 B), so the same user and month
 * draw the same three rows on every request.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { sha256Hex } from '$lib/kernel/ids/ids';

/** A calendar month: `month` is 1–12. */
export type SponsoredMonth = { readonly year: number; readonly month: number };

/** A uniform draw in [0, 1), the contract of the global random generator legacy used. */
export type SponsoredRandomSource = () => number;

/** One generated Sponsored Event before it gets an id: its message and start instant. */
export type SponsoredEventPlan = { readonly message: string; readonly start: string };

/** Every served month carries exactly this many generated Sponsored Events. */
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

/** The month as its `YYYY-MM` key: the seed's month half. */
export function sponsoredMonthKeyOf(month: SponsoredMonth): string {
	return `${month.year}-${String(month.month).padStart(2, '0')}`;
}

/**
 * The seed of a month's draw: `sha256(userId + 'YYYY-MM')`, lowercase hex
 * (owner Q-041 B). The person and the month are the whole input, so the draw
 * is stable per user and month with no table.
 */
export function sponsoredDrawSeed({
	userId,
	month
}: {
	readonly userId: string;
	readonly month: SponsoredMonth;
}): string {
	return sha256Hex(`${userId}${sponsoredMonthKeyOf(month)}`);
}

/** How many hex digits (32 bits) one draw takes. */
const DRAW_HEX = 8;

/**
 * A uniform draw in [0, 1) from a seed's hex: eight hex digits at a time,
 * left to right; once the block is spent it is re-hashed, so the sequence is
 * reproducible from the seed alone and never touches a global generator (R5).
 * The legacy draw only needs a stream of numbers in that range, which is what
 * this hands `planSponsoredMonth`.
 */
export function sponsoredSeededDraw(seedHex: string): SponsoredRandomSource {
	let block = seedHex;
	let offset = 0;
	return () => {
		if (offset + DRAW_HEX > block.length) {
			block = sha256Hex(block);
			offset = 0;
		}
		const draw = Number.parseInt(block.slice(offset, offset + DRAW_HEX), 16) / 0x100000000;
		offset += DRAW_HEX;
		return draw;
	};
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
 * to (not including) the next month's (`adService.ts:93-95`). The served
 * `created_at` is this window's start (Q-042 B), so a month is the same
 * instant for every request, and its boundaries are the user's own: November
 * opens at 10:00Z in Honolulu.
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
 * legacy one, so a scripted source pins every value; the service hands it
 * `sponsoredSeededDraw(sponsoredDrawSeed(...))`, one per user and month
 * (Q-041 B).
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
