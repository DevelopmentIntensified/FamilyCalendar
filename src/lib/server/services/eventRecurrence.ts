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

/**
 * Normalize a full recurrence write. An absent/unknown frequency clears every
 * field — byDay/count/until are meaningless on a one-off Event.
 */
export function normalizeEventRecurrence(input: EventRecurrenceInput): EventRecurrenceWrite {
	const frequency = VALID_FREQUENCIES.includes((input.recurrenceFrequency ?? '') as string)
		? (input.recurrenceFrequency as EventRecurrenceFrequency)
		: null;
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
		recurrenceInterval: Math.max(1, Math.floor((input.recurrenceInterval as number) ?? 1)),
		recurrenceByDay: sanitizeRecurrenceByDay(input.recurrenceByDay),
		recurrenceCount: sanitizeRecurrenceCount(input.recurrenceCount),
		recurrenceUntil:
			typeof input.recurrenceUntil === 'string' && input.recurrenceUntil ? input.recurrenceUntil : null
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
	return typeof raw === 'number' && raw > 0 ? Math.floor(raw) : null;
}
