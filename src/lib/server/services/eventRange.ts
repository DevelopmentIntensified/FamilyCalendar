/**
 * The range contract for the calendar's ranged read (issue 082).
 *
 * Lives in `$lib` rather than in `src/routes/api/events/+server.ts` because a
 * SvelteKit `+server.ts` may only export request handlers — a named export here
 * fails the build with "Invalid export". The handler imports it; the tests
 * exercise it directly rather than through the handler's plumbing.
 */

export interface EventRange {
	from: string;
	to: string;
}

export type EventRangeResult = EventRange | { error: string };

/**
 * Widest window one request may serve. The page load was narrowed to the
 * visible month for load perf (#041/#082); the ranged read exists so navigating
 * to another month fetches THAT month rather than nothing — it is not a licence
 * to widen back to ±2 years.
 */
export const MAX_RANGE_DAYS = 62;

/** "YYYY-MM-DD" and nothing else — an unparseable date is not guessed at. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const BAD_RANGE = { error: 'Ask for a range: ?from=YYYY-MM-DD&to=YYYY-MM-DD.' } as const;

/**
 * A day at UTC midnight, or null. `new Date('2026-02-31')` silently rolls over
 * to March 3, so a date that does not exist has to be caught by comparing the
 * parse back to the input rather than trusted to fail.
 */
function parseDay(day: string): Date | null {
	const parsed = new Date(`${day}T00:00:00.000Z`);
	if (isNaN(parsed.getTime())) return null;
	return parsed.toISOString().slice(0, 10) === day ? parsed : null;
}

/**
 * The window a ranged read will serve, or the reason there isn't one. Bounded,
 * ordered, and both ends required: a half-open range would silently widen to
 * "everything" the moment the caller asked for the wrong end.
 */
export function resolveEventRange(search: URLSearchParams): EventRangeResult {
	const from = search.get('from');
	const to = search.get('to');
	if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) return BAD_RANGE;

	const start = parseDay(from);
	const end = parseDay(to);
	if (!start || !end) return BAD_RANGE;
	if (end.getTime() < start.getTime()) return BAD_RANGE;
	if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86_400_000) {
		return { error: `That range is wider than ${MAX_RANGE_DAYS} days.` };
	}
	return { from, to };
}