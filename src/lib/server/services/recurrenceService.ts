import { DateTime } from 'luxon';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringEventInput {
	id: string;
	start: string | Date;
	end?: string | Date | null;
	recurrenceFrequency: string | null;
	recurrenceInterval: number | null;
}

const MAX_OCCURRENCES = 500;

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

	const occurrences: Date[] = [];
	let steps = 0;

	while (occurrences.length < MAX_OCCURRENCES) {
		const occ = generateOccurrence(anchor, frequency, steps * interval);
		if (!occ.isValid) break;
		const jsDate = occ.toJSDate();
		if (jsDate >= windowEnd) break;
		if (jsDate >= windowStart) {
			occurrences.push(jsDate);
		}
		steps++;
	}

	return occurrences;
}
