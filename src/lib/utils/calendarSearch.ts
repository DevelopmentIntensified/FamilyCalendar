/**
 * #120 mark 1.15 — the calendar's search.
 *
 * A READING filter, in exactly the sense `calendarVisibility.ts` is: it says
 * what to draw, never where a new event lands, and it is never persisted. The
 * field has to be full width under the controls (a 240px `⌘K` affordance only
 * means something if you already know the shortcut), which raises the stakes —
 * a wide field that quietly misses half of what a rail once listed is worse
 * than no field at all, because it looks like an answer.
 *
 * The rule, in one line: every word you type has to appear somewhere in the
 * event. AND, not OR — typing "football park" should find the practice at
 * Memorial Park, and typing "football piano" should find nothing rather than
 * everything with either word in it.
 */

export interface SearchableEvent {
	title: string | null;
	/** Optional because a due TASK has no notes or place — it is searched on
	 *  its title alone, and nothing here pretends otherwise. */
	description?: string | null;
	location?: string | null;
}

/** Trim, collapse inner runs of whitespace, lowercase. Never throws. */
export function normaliseQuery(query: string): string {
	return (query ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Everything a person could reasonably be typing at an event. */
function haystack(event: SearchableEvent): string {
	return [event.title, event.description, event.location]
		.filter((part): part is string => typeof part === 'string' && part.length > 0)
		.join(' ')
		.toLowerCase();
}

/** An empty query keeps everything — that is the unfiltered state, not a miss. */
export function bySearch<T extends SearchableEvent>(events: T[], query: string): T[] {
	const q = normaliseQuery(query);
	if (!q) return events;
	const terms = q.split(' ');
	return events.filter((event) => {
		const text = haystack(event);
		return terms.every((term) => text.includes(term));
	});
}

/** How many a query would keep. Drives the "N of M" line, so it is not a lie. */
export function countMatches<T extends SearchableEvent>(events: T[], query: string): number {
	return bySearch(events, query).length;
}
