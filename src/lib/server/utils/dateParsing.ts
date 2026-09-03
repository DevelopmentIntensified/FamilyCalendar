import {
	DAY_ALT as _DAY_ALT,
	MONTH_ALT as _MONTH_ALT,
	MONTH_INDEX_1,
	escapeRegExp as _escapeRegExp
} from '$lib/utils/dateVocab';

// Shared NLP vocabulary from `src/lib/utils/dateVocab.ts` — server-side
// consumers (naturalLanguageService) build on these without re-declaring.
// Index conventions: MONTH_MAP is 1-based (Luxon months), DAY_MAP is the
// JS weekday order (Sunday = 0).

export const MONTH_ALT = _MONTH_ALT;

export const MONTH_MAP: Record<string, number> = MONTH_INDEX_1;

// Longest-first so "september" wins over "sept" (same table everywhere).
// Full weekday names only — no short forms (DAY_ALT predates them).
export const DAY_MAP: Record<string, number> = {
	sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
	thursday: 4, friday: 5, saturday: 6
};

export const DAY_ALT = _DAY_ALT;

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
	return _escapeRegExp(s);
}
