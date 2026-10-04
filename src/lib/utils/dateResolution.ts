/**
 * Shared date + cadence RESOLUTION (issue 114).
 *
 * `dateVocab.ts` holds the tokens (month names, weekday names, unit words);
 * this holds the RULES that turn a matched phrase into a year, a day-offset
 * or a cadence. Before this existed, three parsers each re-implemented
 * resolution and drifted: task quick-add (client) rolled a bare month-day on
 * a different rule than the event parser, `quarterly` was a cadence for bills
 * only, and the client reached into `$lib/server/db/actions/` because there
 * was no shared layer to import.
 *
 * Two rules live here, once each:
 *
 *   - `resolveMonthDay` — which YEAR a bare month-day belongs to.
 *   - `matchCadence`   — which cadence a phrase names.
 *
 * Client-safe ON PURPOSE: no Luxon, no db, no server imports, no `Date`
 * objects. Every function takes and returns plain calendar arithmetic
 * (year / month / day, month 1-based), because that is all three parsers
 * actually need — the caller builds its own `Date` or `DateTime` from the
 * answer, in its own zone. A shared rule that had to live server-side to
 * reuse existing code would be a design failure, not a workaround.
 */

/** A calendar date with no time and no zone. `month` is 1-based. */
export interface CalendarDate {
	year: number;
	/** 1 = January … 12 = December. */
	month: number;
	day: number;
}

// ---------------------------------------------------------------------------
// Date resolution
// ---------------------------------------------------------------------------

/** Month lengths for a common year, 1-based (index 0 = January). */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Proleptic Gregorian leap year — the rule that gives Feb its 29th. */
function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Days in a 1-based month. Pure arithmetic rather than a `Date` probe: a
 * `Date` cannot represent "Feb 29 in a non-leap year", so asking one for the
 * length of a February it will never hold silently rolls into March.
 */
export function daysInMonth(year: number, month: number): number {
	if (month < 1 || month > 12) return 0;
	return month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month - 1];
}

/**
 * THE rollover rule, shared by every parser.
 *
 * An explicit year is authoritative, even when it is in the past. Otherwise
 * the date is taken in the current year and rolls to next year only when it
 * sits STRICTLY BEFORE today — **today stays today**. Typing today's date
 * must not book you a year out.
 *
 * The day is clamped to the target month's length, so "feb 30" is the 28th
 * rather than an impossible date the caller has to reject.
 *
 * A CLAMPED day never rolls. The clamp is already one guess about what the
 * author meant ("feb 30" ⇒ "late February"); letting the rollover stack a
 * second guess on top silently moves a date a year away from the words that
 * produced it. One guess is recoverable from the date the author sees.
 *
 * Returns null when the month or day cannot name a real calendar date.
 */
export function resolveMonthDay(
	now: CalendarDate,
	month: number,
	day: number,
	explicitYear: number | null
): CalendarDate | null {
	if (!Number.isInteger(month) || month < 1 || month > 12) return null;
	if (!Number.isInteger(day) || day < 1 || day > 31) return null;
	const year = explicitYear ?? now.year;
	const clamped = Math.min(day, daysInMonth(year, month));
	const resolved: CalendarDate = { year, month, day: clamped };
	if (explicitYear !== null) return resolved;
	if (clamped !== day) return resolved;
	if (month < now.month || (month === now.month && clamped < now.day)) {
		return { ...resolved, year: year + 1 };
	}
	return resolved;
}

/**
 * THE weekday rule, shared by every parser: days from a weekday to the next
 * occurrence of another, 1..7. Both 0-based Sunday-first (JS `Date.getDay`).
 *
 * Today is never "0 days away" — a bare weekday name is always the NEXT
 * one, so "friday" said on a Friday means this coming week… never, it means
 * the Friday a week out. Callers that want "today counts" must say so.
 */
export function daysUntilWeekday(from: number, to: number): number {
	let delta = (((to - from) % 7) + 7) % 7;
	if (delta === 0) delta = 7;
	return delta;
}

// ---------------------------------------------------------------------------
// Cadence vocabulary
// ---------------------------------------------------------------------------

/** The four recurrence units a cadence can be measured in. */
export type CadenceUnit = 'day' | 'week' | 'month' | 'year';

/** A cadence as `every N units` — the form every parser actually needs. */
export interface Cadence {
	unit: CadenceUnit;
	/** Always ≥ 1; "every other week" is `{ week, 2 }`, not a separate word. */
	every: number;
}

/** The storage vocabulary a cadence collapses onto when it carries an interval. */
export const CADENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type CadenceFrequency = (typeof CADENCE_FREQUENCIES)[number];

const FREQUENCY_FROM_UNIT: Record<CadenceUnit, CadenceFrequency> = {
	day: 'daily',
	week: 'weekly',
	month: 'monthly',
	year: 'yearly'
};

/** Cadence → the storage frequency word ("every 3 months" → "monthly"). */
export function cadenceFrequency(cadence: Cadence): CadenceFrequency {
	return FREQUENCY_FROM_UNIT[cadence.unit];
}

const VALUE_FROM_UNIT: Record<CadenceUnit, string> = {
	day: 'daily',
	week: 'weekly',
	month: 'monthly',
	year: 'yearly'
};

/**
 * Cadence → the shared wire value: `daily|weekly|biweekly|monthly|yearly|
 * every_N_units`. `biweekly` survives as the named spelling of every-2-weeks
 * because events.recurrence values are stored with it.
 */
export function cadenceToValue(cadence: Cadence): string {
	if (cadence.every === 1) return VALUE_FROM_UNIT[cadence.unit];
	if (cadence.every === 2 && cadence.unit === 'week') return 'biweekly';
	return `every_${cadence.every}_${cadence.unit}s`;
}

/**
 * The inverse of `cadenceToValue`; null for anything outside the vocabulary.
 *
 * `biweekly` is the canonical spelling of every-2-weeks, so it reads back with
 * `every: 2` — not as a bare weekly. `every_2_weeks` is still accepted on the
 * way in, because stored rows predate the canonicalization.
 */
export function valueToCadence(value: string): Cadence | null {
	if (value === 'biweekly') return { unit: 'week', every: 2 };
	const base = lookupUnit(value);
	if (base) return { unit: base, every: 1 };
	const match = /^every_(\d+)_([a-z]+)s$/.exec(value);
	if (!match) return null;
	const unit = cadenceUnit(match[2]);
	if (!unit) return null;
	const every = parseInt(match[1], 10);
	return every >= 1 ? { unit, every } : null;
}

/** Bare wire words → their unit. A switch, not a lookup table: the vocabulary
 *  is four words and this keeps the mapping exhaustive for the compiler. */
function lookupUnit(value: string): CadenceUnit | null {
	switch (value) {
		case 'daily':
			return 'day';
		case 'weekly':
		case 'biweekly':
			return 'week';
		case 'monthly':
			return 'month';
		case 'yearly':
			return 'year';
		default:
			return null;
	}
}

/** Every unit spelling a phrase may use, longest first so `weeks` wins. */
const CADENCE_UNIT_ALT = 'days|weeks|months|years|day|week|month|year|wks|wk|mos|mo|yrs|yr';

/** Any unit spelling → the canonical singular unit. Exported: callers that
 *  hold their own regex captures resolve them through this, so the unit
 *  vocabulary stays in one place. */
export function cadenceUnit(token: string): CadenceUnit | null {
	const stem = token.toLowerCase().replace(/s$/, '');
	if (stem === 'day') return 'day';
	if (stem === 'week' || stem === 'wk') return 'week';
	if (stem === 'month' || stem === 'mo') return 'month';
	if (stem === 'year' || stem === 'yr') return 'year';
	return null;
}

interface CadenceStep {
	re: RegExp;
	cadence: (m: RegExpMatchArray) => Cadence;
}

/**
 * THE cadence phrase table, shared by every parser.
 *
 * Ordered longest-phrase-first so a compound form wins over the bare word it
 * contains ("every 3 weeks" over "weeks", "every other week" over "week").
 * Each entry is a whole phrase; callers strip `match[0]` and keep their own
 * parser-specific rules around it ("every <weekday>", "per month", "monthly
 * on the 15th"), because those carry a date anchor or a storage quirk that
 * is not part of the cadence itself.
 *
 * The optional `repeats?` prefix is part of the shared table so the span a
 * parser strips covers the whole phrase (issue 030: "repeat every week"
 * must not leave "repeat" in the title).
 */
const CADENCE_STEPS: CadenceStep[] = [
	{
		re: new RegExp(`\\b(?:repeats?\\s+)?every\\s+other\\s+(${CADENCE_UNIT_ALT})\\b`, 'i'),
		cadence: (m) => ({ unit: cadenceUnit(m[1]) ?? 'week', every: 2 })
	},
	{
		re: new RegExp(`\\b(?:repeats?\\s+)?every\\s+(\\d+)\\s+(${CADENCE_UNIT_ALT})\\b`, 'i'),
		cadence: (m) => ({ unit: cadenceUnit(m[2]) ?? 'week', every: Math.max(1, parseInt(m[1], 10)) })
	},
	{
		re: /\b(?:repeats?\s+)?every\s+quarter\b|\bquarterly\b|\bper\s+quarter\b|\/\s*quarter\b/i,
		cadence: () => ({ unit: 'month', every: 3 })
	},
	{
		re: new RegExp(`\\b(?:repeats?\\s+)?every\\s+(${CADENCE_UNIT_ALT})\\b`, 'i'),
		cadence: (m) => ({ unit: cadenceUnit(m[1]) ?? 'day', every: 1 })
	},
	{
		re: /\b(?:biannually|bi-?annually|semi-?annually|twice\s+(?:a|per)\s+year|every\s+half\s+year)\b/i,
		cadence: () => ({ unit: 'month', every: 6 })
	},
	{
		re: /\b(?:repeats?\s+)?(?:daily|nightly)\b/i,
		cadence: () => ({ unit: 'day', every: 1 })
	},
	{
		re: /\b(?:repeats?\s+)?weekly\b/i,
		cadence: () => ({ unit: 'week', every: 1 })
	},
	{
		re: /\b(?:repeats?\s+)?monthly\b/i,
		cadence: () => ({ unit: 'month', every: 1 })
	},
	{
		re: /\b(?:repeats?\s+)?(?:yearly|annually)\b/i,
		cadence: () => ({ unit: 'year', every: 1 })
	}
];

/** A matched cadence phrase, plus the span a caller strips from the title. */
export interface CadenceMatch {
	cadence: Cadence;
	match: RegExpExecArray;
}

/**
 * The first cadence phrase in `text`, or null when it names no cadence.
 * The whole-class match: any phrase in the shared table resolves, whatever
 * case, word order, or surrounding title words.
 */
export function matchCadence(text: string): CadenceMatch | null {
	for (const step of CADENCE_STEPS) {
		const match = step.re.exec(text);
		if (match) return { cadence: step.cadence(match), match };
	}
	return null;
}