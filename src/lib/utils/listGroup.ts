import { DateTime } from 'luxon';

/** ms epoch for Date or ISO string; NaN when absent/unparseable. */
export function toDateMs(d: Date | string | null | undefined): number {
	if (d instanceof Date) return d.getTime();
	if (!d) return NaN;
	return DateTime.fromISO(d).toMillis();
}

/** ISO-day key (`yyyy-MM-dd`) shared by ListView event + task buckets. */
export function dateKeyOf(d: Date | string): string {
	const dt = d instanceof Date ? DateTime.fromJSDate(d) : DateTime.fromISO(String(d));
	return dt.toISODate() ?? '';
}

/** Group items into ISO-day buckets; items without a date are skipped. */
export function groupByDateKey<T>(
	items: T[],
	getDate: (item: T) => Date | string | null | undefined
) {
	const out: Record<string, T[]> = {};
	for (const item of items) {
		const d = getDate(item);
		if (!d) continue;
		const key = dateKeyOf(d);
		if (!key) continue;
		(out[key] ??= []).push(item);
	}
	return out;
}
