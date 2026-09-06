/**
 * One home for the Recurring Event write shape (frequency + interval + byDay
 * + count + until). Create (POST /api/events) and edit (PUT /api/events/[id])
 * both funnel through here so the field coverage can't drift between writers
 * again. ICS import produces the same shape from RRULE syntax (its parser
 * keeps its own ordinal guard) — the field names and null-meanings match this
 * module exactly.
 */

export type EventRecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface EventRecurrenceInput {
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
	recurrenceByDay?: unknown;
	recurrenceCount?: unknown;
	recurrenceUntil?: unknown;
}

export interface EventRecurrenceWrite {
	recurrenceFrequency: EventRecurrenceFrequency | null;
	recurrenceInterval: number | null;
	recurrenceByDay: string[] | null;
	recurrenceCount: number | null;
	recurrenceUntil: string | null;
}

const VALID_FREQUENCIES: EventRecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];

const VALID_BYDAY = new Set(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);

function isEventRecurrenceFrequency(v: string): v is EventRecurrenceFrequency {
	// SAFETY: VALID_FREQUENCIES holds exactly the four literals; viewing it as
	// strings makes the membership test exact with no precision lost.
	return (VALID_FREQUENCIES as readonly string[]).includes(v);
}

function isNonEmptyString(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0;
}

function isCountNumber(v: unknown): v is number {
	return typeof v === 'number';
}

/**
 * Normalize a full recurrence write. An absent/unknown frequency clears every
 * field — byDay/count/until are meaningless on a one-off Event.
 */
export function normalizeEventRecurrence(input: EventRecurrenceInput): EventRecurrenceWrite {
	const rawFrequency = input.recurrenceFrequency ?? '';
	const frequency = isEventRecurrenceFrequency(rawFrequency) ? rawFrequency : null;
	if (!frequency) {
		return {
			recurrenceFrequency: null,
			recurrenceInterval: null,
			recurrenceByDay: null,
			recurrenceCount: null,
			recurrenceUntil: null
		};
	}
	return {
		recurrenceFrequency: frequency,
		recurrenceInterval: Math.max(1, Math.floor(input.recurrenceInterval ?? 1)),
		recurrenceByDay: sanitizeRecurrenceByDay(input.recurrenceByDay),
		recurrenceCount: sanitizeRecurrenceCount(input.recurrenceCount),
		recurrenceUntil: isNonEmptyString(input.recurrenceUntil) ? input.recurrenceUntil : null
	};
}

/**
 * Keep plain weekday codes (MO..SU), uppercased. Strips RRULE ordinal
 * prefixes (e.g. 2TU -> TU) so the ICS importer can delegate here.
 * Returns null when nothing valid remains.
 */
export function sanitizeRecurrenceByDay(raw: unknown): string[] | null {
	if (!Array.isArray(raw)) return null;
	const days = raw
		.filter((d): d is string => typeof d === 'string')
		.map((d) => d.toUpperCase().replace(/^[+-]?\d+/, ''))
		.filter((d) => VALID_BYDAY.has(d));
	return days.length > 0 ? days : null;
}

/** Positive integer counts only; anything else is unbounded (null). */
export function sanitizeRecurrenceCount(raw: unknown): number | null {
	return isCountNumber(raw) && raw > 0 ? Math.floor(raw) : null;
}
