// Longest-first so "september" wins over "sep" (same table everywhere).
export const MONTH_ALT = 'january|february|september|december|november|october|august|april|march|june|july|may|sept|jan|feb|mar|apr|aug|sep|oct|nov|dec';

export const MONTH_MAP: Record<string, number> = {
	january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
	july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
	// Common abbreviations
	jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
	sept: 9, sep: 9, oct: 10, nov: 11, dec: 12
};

export const DAY_MAP: Record<string, number> = {
	sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
	thursday: 4, friday: 5, saturday: 6
};

export const DAY_ALT = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';

export function normalizeTime(hour: number, minute = 0): string {
	return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function applyPeriod(hour: number, period?: string): number {
	const p = period?.toLowerCase();
	if (p === 'pm' && hour < 12) return hour + 12;
	if (p === 'am' && hour === 12) return 0;
	return hour;
}

export function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
