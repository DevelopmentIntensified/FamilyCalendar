/**
 * calendarPage search rules: the calendar's reading filter over title,
 * description and location.
 *
 * The rule, in one line: every word you type has to appear somewhere in the
 * event. AND, not OR — "football park" finds the practice at Memorial Park;
 * "football piano" finds nothing rather than everything with either word.
 *
 * A reading filter: never persisted, never decides where a new event lands.
 * Ported from legacy `src/lib/utils/calendarSearch.ts` (#120).
 *
 * Doc: ./README.md#the-reading-filters
 */

export interface CalendarSearchableRow {
	title: string | null;
	/** Optional because a due TASK has no notes or place — it is searched on
	 *  its title alone, and nothing here pretends otherwise. */
	description?: string | null;
	location?: string | null;
}

/** Trim, collapse inner runs of whitespace, lowercase. Never throws. */
export function normaliseCalendarQuery(query: string): string {
	return (query ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Everything a person could reasonably be typing at an event. */
function searchableText(row: CalendarSearchableRow): string {
	return [row.title, row.description, row.location]
		.filter((part): part is string => typeof part === 'string' && part.length > 0)
		.join(' ')
		.toLowerCase();
}

/** An empty query keeps everything — that is the unfiltered state, not a miss. */
export function byCalendarSearch<T extends CalendarSearchableRow>(
	rows: readonly T[],
	query: string
): T[] {
	const normalised = normaliseCalendarQuery(query);
	if (!normalised) return [...rows];
	const terms = normalised.split(' ');
	return rows.filter((row) => {
		const text = searchableText(row);
		return terms.every((term) => text.includes(term));
	});
}

/** How many a query would keep. Drives the "N of M" line, so it is not a lie. */
export function countCalendarMatches<T extends CalendarSearchableRow>(
	rows: T[],
	query: string
): number {
	return byCalendarSearch(rows, query).length;
}
