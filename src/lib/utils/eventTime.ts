import { DateTime } from 'luxon';

import { isDateString } from './typeGuards';

/**
 * Normalizes the runtime shapes a timestamp arrives in — Date instances,
 * ISO strings, or pg's space-separated form — into a real Date. Callers
 * guard against null/undefined before calling.
 */
export function toDate(v: Date | string | null | undefined): Date {
	if (v instanceof Date) return v;
	if (isDateString(v)) return new Date(v);
	return new Date(NaN);
}

/** Null-safe, validity-checked time formatting ("h:mm a"). Empty string when unknown. */
export function formatEventTime(v: Date | string | undefined | null): string {
	if (!v) return '';
	const d = toDate(v);
	if (isNaN(d.getTime())) return '';
	const dt = DateTime.fromJSDate(d);
	return dt.isValid ? dt.toFormat('h:mm a') : '';
}
