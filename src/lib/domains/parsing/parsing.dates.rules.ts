/**
 * parsing cadence — the one cadence vocabulary and its ordered phrase table
 * (legacy `src/lib/utils/dateResolution.ts`).
 *
 * Every parser that names a repeat reads THIS table: the event parser, the
 * Task quick-add, and anything added later. A phrase is added here once and
 * lands in all of them. Month/weekday arithmetic itself lives in
 * `kernel/time` (K-06) and is imported, never re-implemented.
 *
 * Client-safe: no Luxon, no db, no server imports.
 */
import type { RecurrenceFrequency } from '$lib/kernel/time/dates';

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

const FREQUENCY_FROM_UNIT: Record<CadenceUnit, RecurrenceFrequency> = {
	day: 'daily',
	week: 'weekly',
	month: 'monthly',
	year: 'yearly'
};

/** Cadence → the storage frequency word ("every 3 months" → "monthly"). */
export function cadenceFrequency(cadence: Cadence): RecurrenceFrequency {
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

/** Bare wire words → their unit. A switch keeps the mapping exhaustive. */
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

/** Every unit spelling a phrase may use, longest first so `weeks` wins. */
const CADENCE_UNIT_ALT = 'days|weeks|months|years|day|week|month|year|wks|wk|mos|mo|yrs|yr';

/**
 * Any unit spelling → the canonical singular unit. Exported: callers that
 * hold their own regex captures resolve them through this, so the unit
 * vocabulary stays in one place.
 */
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
