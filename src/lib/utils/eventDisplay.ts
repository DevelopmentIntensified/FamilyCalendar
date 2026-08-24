import { DateTime } from 'luxon';

export type ParsedDay<T> = T & { start: Date; end: Date | null; date: Date };

export function deriveEventProps<T extends Record<string, any>>(
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
 * Splits events that span multiple days into one entry per day, each
 * carrying its own `date`. Single-day events pass through untouched.
 */
export function parseEvents<T extends Record<string, any>>(
	eventsData: T[],
	zone?: string
): ParsedDay<T>[] {
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
