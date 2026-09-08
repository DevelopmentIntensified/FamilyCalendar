import { DateTime } from 'luxon';

export type ParsedDay<T> = T & { start: Date; end: Date | null; date: Date };

/** Minimal row shape parseEvents/deriveEventProps need: start/end as Date or ISO string. */
type EventLike = {
	start: Date | string | number;
	end?: Date | string | number | null;
};

export function deriveEventProps<T extends EventLike>(
	e: T,
	date: Date,
	end: Date | null
): ParsedDay<T> {
	return {
		...e,
		start: date,
		end,
		date
	};
}

/**
 * Buckets items by a caller-supplied date key in ONE pass (#041).
 * Replaces per-day-cell `.filter()` scans (O(cells × items)) with a single
 * build + O(1) lookups. Nullish keys are skipped, matching the old
 * filter semantics (`event.date && ...`).
 */
export function groupByDateKey<T>(
	items: T[],
	keyOf: (item: T) => string | null | undefined
): Map<string, T[]> {
	const buckets = new Map<string, T[]>();
	for (const item of items) {
		const key = keyOf(item);
		if (key == null) continue;
		const bucket = buckets.get(key);
		if (bucket) bucket.push(item);
		else buckets.set(key, [item]);
	}
	return buckets;
}

/**
 * Splits events that span multiple days into one entry per day, each
 * carrying its own `date`. Single-day events pass through untouched.
 */
export function parseEvents<T extends EventLike>(eventsData: T[], zone?: string): ParsedDay<T>[] {
	return eventsData.flatMap((e): ParsedDay<T>[] => {
		const startDate = new Date(e.start);
		const endDate = e.end ? new Date(e.end) : null;

		const start = DateTime.fromJSDate(startDate, { zone });
		const end = endDate ? DateTime.fromJSDate(endDate, { zone }) : null;

		if (!end || start.hasSame(end, 'day')) {
			return [deriveEventProps(e, startDate, endDate)];
		}

		const diffDays = Math.round(Math.abs(end.diff(start, 'days').days));
		const days: ParsedDay<T>[] = [];

		for (let i = 0; i <= diffDays; i++) {
			days.push(deriveEventProps(e, start.plus({ days: i }).toJSDate(), endDate));
		}

		return days;
	});
}
