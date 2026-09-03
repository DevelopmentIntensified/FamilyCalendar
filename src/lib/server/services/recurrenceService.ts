import { DateTime } from 'luxon';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringEventInput {
	id: string;
	start: string | Date;
	end?: string | Date | null;
	recurrenceFrequency: string | null;
	recurrenceInterval: number | null;
	recurrenceByDay?: string[] | null;
	recurrenceCount?: number | null;
	recurrenceUntil?: string | Date | null;
}

const MAX_OCCURRENCES = 500;

const WEEKDAY_LETTERS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Normalize BYDAY to a set of plain weekday letters (MO..SU). */
function normalizeByDay(raw?: string[] | null): Set<string> | null {
	if (!raw || raw.length === 0) return null;
	const days = raw.filter((d) => typeof d === 'string' && WEEKDAY_LETTERS.includes(d.toUpperCase()));
	return days.length > 0 ? new Set(days.map((d) => d.toUpperCase())) : null;
}

/**
 * Drizzle's timestamptz columns are declared mode:'string', but the
 * postgres.js driver hands back Date objects at runtime, and raw pg
 * strings use the space-separated form. Normalize all three shapes.
 */
function parseTimestamp(v: unknown): DateTime {
	if (v instanceof Date) return DateTime.fromJSDate(v, { zone: 'utc' });
	const s = String(v ?? '').trim().replace(' ', 'T');
	return DateTime.fromISO(s, { zone: 'utc' });
}

function generateOccurrence(
	anchor: DateTime,
	frequency: RecurrenceFrequency,
	steps: number
): DateTime {
	switch (frequency) {
		case 'daily':
			return anchor.plus({ days: steps });
		case 'weekly':
			return anchor.plus({ weeks: steps });
		case 'monthly': {
			const totalMonths = anchor.year * 12 + (anchor.month - 1) + steps;
			const year = Math.floor(totalMonths / 12);
			const month = (totalMonths % 12) + 1;
			const daysInMonth = DateTime.utc(year, month, 1).daysInMonth ?? 28;
			return anchor.set({
				year,
				month,
				day: Math.min(anchor.day, daysInMonth)
			});
		}
		case 'yearly': {
			const candidate = anchor.set({ year: anchor.year + steps });
			if (candidate.day >= anchor.day) return candidate;
			// Luxon clamped backward (e.g. Feb 29 -> Feb 28 in a non-leap
			// year); roll forward to the first of the next month instead.
			return candidate.plus({ months: 1 }).set({ day: 1 });
		}
	}
}

/**
 * Expands a recurring event into concrete occurrence start Dates within
 * [windowStart, windowEnd). Non-recurring events yield their single start.
 * Occurrences are generated from the original start as an anchor so that
 * "monthly on the 31st" re-anchors after short months and Feb 29 yearly
 * rolls to Mar 1. Stepping happens in UTC so instants stay stable
 * regardless of server timezone.
 */
export function expandRecurrence(
	event: RecurringEventInput,
	windowStart: Date,
	windowEnd: Date
): Date[] {
	const anchor = parseTimestamp(event.start);
	if (!anchor.isValid) return [];

	const frequency = event.recurrenceFrequency as RecurrenceFrequency | null;
	if (!frequency) {
		const s = anchor.toJSDate();
		return s >= windowStart && s < windowEnd ? [s] : [];
	}

	const interval = Math.max(1, event.recurrenceInterval ?? 1);
	const byDay = normalizeByDay(event.recurrenceByDay);
	// JIT-check: only accept the well-formed "weekday phase" times, which come
	// from RRULE BYDAY. Monthly/yearly BYDAY is not supported; those fall back
	// to the plain frequency stepping below (anchor weekday only), matching
	// the pre-existing behavior for such imports.
	if (byDay && (frequency === 'daily' || frequency === 'weekly')) {
		return expandWeekdaySeries(
			anchor,
			frequency,
			interval,
			byDay,
			event.recurrenceCount,
			recurrenceUntil(event),
			windowStart,
			windowEnd
		);
	}

	const count = positiveCount(event.recurrenceCount);
	const until = recurrenceUntil(event);

	const occurrences: Date[] = [];
	let steps = 0;
	let produced = 0;
	while (produced < MAX_OCCURRENCES) {
		const occ = generateOccurrence(anchor, frequency, steps * interval);
		if (!occ.isValid) break;
		const jsDate = occ.toJSDate();
		produced++;
		if (count !== null && produced > count) break;
		if (until !== null && jsDate > until) break;
		if (jsDate >= windowEnd) break;
		if (jsDate >= windowStart) {
			occurrences.push(jsDate);
		}
		steps++;
	}

	return occurrences;
}

function positiveCount(raw?: number | null): number | null {
	return raw && raw > 0 ? Math.floor(raw) : null;
}

/** The series cutoff instant (RRULE UNTIL), or null when unbounded. */
function recurrenceUntil(event: RecurringEventInput): Date | null {
	if (!event.recurrenceUntil) return null;
	const dt = parseTimestamp(event.recurrenceUntil);
	return dt.isValid ? dt.toJSDate() : null;
}

/**
 * Expand a recurring series that repeats on specific weekdays (RRULE BYDAY).
 * Iterates day-by-day from the anchor so that daily/weekly BYDAY rules land
 * on every listed weekday, respecting the interval phase for weekly rules.
 * `recurrenceCount` (total occurrences across the series) is honored even
 * when the window starts after the series has begun.
 */
function expandWeekdaySeries(
	anchor: DateTime,
	frequency: RecurrenceFrequency,
	interval: number,
	byDay: Set<string>,
	count: number | null,
	until: Date | null,
	windowStart: Date,
	windowEnd: Date
): Date[] {
	const occurrences: Date[] = [];
	let produced = 0;
	let cur = anchor;
	const windowEndMs = windowEnd.getTime();

	while (produced < MAX_OCCURRENCES) {
		const weekday = WEEKDAY_LETTERS[cur.weekday - 1];
		let passes = false;
		if (frequency === 'daily') {
			passes = byDay.has(weekday);
		} else {
			// weekly: must be a listed weekday AND in phase with the interval.
			const weeksFromAnchor = cur.startOf('week').diff(anchor.startOf('week'), 'weeks').weeks;
			passes = byDay.has(weekday) && weeksFromAnchor % interval === 0;
		}

		if (passes) {
			produced++;
			if (count !== null && produced > count) break;
			const jsDate = cur.toJSDate();
			if (until !== null && jsDate > until) break;
			if (jsDate >= windowStart && jsDate < windowEnd) occurrences.push(jsDate);
		}

		cur = cur.plus({ days: 1 });
		if (cur.toMillis() >= windowEndMs) break;
	}

	return occurrences;
}
