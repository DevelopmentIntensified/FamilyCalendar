import { DateTime } from 'luxon';

/**
 * Normalizes any runtime shape a timestamp arrives in — Date instances,
 * ISO strings, or pg's space-separated form — into a real Date.
 */
export function toDate(v: unknown): Date {
	return v instanceof Date ? v : new Date(v as string);
}

/** Null-safe, validity-checked time formatting ("h:mm a"). Empty string when unknown. */
export function formatEventTime(v: Date | string | undefined | null): string {
	if (!v) return '';
	const d = toDate(v);
	if (isNaN(d.getTime())) return '';
	const dt = DateTime.fromJSDate(d);
	return dt.isValid ? dt.toFormat('h:mm a') : '';
}
