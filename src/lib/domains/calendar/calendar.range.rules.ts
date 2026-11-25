/**
 * The ranged read's contract (issue 082): both ends required, real ordered
 * `YYYY-MM-DD` dates, at most 62 days, and the expansion window with a grid
 * week of padding each side. Ported from `eventRange.ts`; pure so the route's
 * query string is the only input.
 *
 * Doc: ./README.md#invariants
 */
import { isoDate } from '$lib/kernel/validation/validators';

export interface EventRange {
	readonly from: string;
	readonly to: string;
}

export type EventRangeResult = EventRange | { readonly error: string };

/** Widest window one request may serve — not a licence to widen back to ±2 years. */
export const MAX_RANGE_DAYS = 62;

/** The 400 copy when the range is absent, malformed, non-existent or backwards. */
export const RANGE_REQUIRED_MESSAGE =
	'Ask for a range: ?from=YYYY-MM-DD&to=YYYY-MM-DD.';

/** The 400 copy when both ends are real but the span is too wide. */
export const RANGE_TOO_WIDE_MESSAGE = `That range is wider than ${MAX_RANGE_DAYS} days.`;

const BAD_RANGE = { error: RANGE_REQUIRED_MESSAGE } as const;

/** A day at UTC midnight, or null. Feb 31 silently rolls over, so compare back. */
function parseDay(day: string): Date | null {
	if (!isoDate().safeParse(day).success) return null;
	const parsed = new Date(`${day}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString().slice(0, 10) === day ? parsed : null;
}

/**
 * The window a ranged read will serve, or the reason there isn't one. Bounded,
 * ordered and both ends required: a half-open range would silently widen to
 * "everything" the moment the caller asked for the wrong end. `from`/`to` are
 * the query's own values (`searchParams.get` semantics: absent is undefined).
 */
export function resolveEventRange(query: {
	readonly from?: string | null;
	readonly to?: string | null;
}): EventRangeResult {
	const from = query.from;
	const to = query.to;
	if (!from || !to) return BAD_RANGE;

	const start = parseDay(from);
	const end = parseDay(to);
	if (!start || !end) return BAD_RANGE;
	if (end.getTime() < start.getTime()) return BAD_RANGE;
	if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86_400_000) {
		return { error: RANGE_TOO_WIDE_MESSAGE };
	}
	return { from, to };
}

/** A grid week of padding each side (adjacent-month cells, viewer-zone slack). */
const PAD_MS = 7 * 86_400_000;

export interface EventRangeWindow {
	readonly start: Date;
	readonly end: Date;
	/** ISO strings for drizzle timestamptz comparisons (`mode:'string'`). */
	readonly startIso: string;
	readonly endIso: string;
}

/**
 * `from` 00:00Z through `to` 23:59:59.999Z, padded a week each side (#218).
 * The old handler built the month of `to` only, so a two-month read lost
 * `from`'s month.
 */
export function eventRangeWindow(range: EventRange): EventRangeWindow {
	const start = new Date(Date.parse(`${range.from}T00:00:00.000Z`) - PAD_MS);
	const end = new Date(Date.parse(`${range.to}T23:59:59.999Z`) + PAD_MS);
	return { start, end, startIso: start.toISOString(), endIso: end.toISOString() };
}
