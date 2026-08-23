const oneDayMs = 24 * 60 * 60 * 1000;

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
	eventsData: T[]
): ParsedDay<T>[] {
	return eventsData.flatMap((e): ParsedDay<T>[] => {
		const startDate = new Date(e.start);
		const endDate = e.end ? new Date(e.end) : null;

		if (!endDate || startDate.getDate() === endDate.getDate()) {
			return [deriveEventProps(e, startDate, endDate)];
		}

		const diffDays = Math.round(Math.abs((startDate.getTime() - endDate.getTime()) / oneDayMs));
		const days: ParsedDay<T>[] = [];

		for (let i = 0; i <= diffDays; i++) {
			days.push(deriveEventProps(e, new Date(startDate.getTime() + oneDayMs * i), endDate));
		}

		return days;
	});
}
