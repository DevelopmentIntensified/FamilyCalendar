/** Minimal calendar shape for name matching (page + modal share it). */
export interface NamedCalendar {
	id: string;
	name: string;
}

/**
 * Resolve an NLP "on the X calendar" name to a calendar id.
 * Exact (case-insensitive) wins; falls back to partial matches in either
 * direction. Never blocks creation: null means keep the default.
 */
export function matchCalendarByName(
	calendars: NamedCalendar[],
	name: string
): NamedCalendar | null {
	const want = String(name).toLowerCase();
	return (
		calendars.find((c) => c.name.toLowerCase() === want) ??
		calendars.find(
			(c) => c.name.toLowerCase().includes(want) || want.includes(c.name.toLowerCase())
		) ??
		null
	);
}
