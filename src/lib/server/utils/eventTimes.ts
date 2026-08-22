import { DateTime } from 'luxon';

/**
 * Drizzle declares timestamptz columns mode:'string', but postgres.js
 * hands back Date objects at runtime and raw strings can use the
 * space-separated form. Normalize every shape into a valid DateTime,
 * or null when nothing sensible is there.
 */
export function toDateTime(v: unknown): DateTime | null {
	if (v instanceof Date) return DateTime.fromJSDate(v);
	if (v === null || v === undefined || v === '') return null;
	const dt = DateTime.fromISO(String(v).trim().replace(' ', 'T'));
	return dt.isValid ? dt : null;
}
