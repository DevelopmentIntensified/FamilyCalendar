/**
 * parsing event recurrence — one ordered table, first match only, then the
 * shared cadence table, then the weekly day lists, recurrence ends and
 * reminders.
 *
 * Every matched phrase is pushed into `phrases` so the title step strips it:
 * a recurrence cue describes the schedule, never the event name.
 */
import type { DateTime } from 'luxon';
import type { ClaimBook } from './parsing.claims.rules';
import { resolveUntilDate, nearestWeekday, nextWeekday, WEEK_ORDER } from './parsing.event-dates.rules';
import { WEEKDAY_FULL, extractDayTokens } from './parsing.vocabulary.rules';
import { cadenceToValue, cadenceUnit, matchCadence } from './parsing.dates.rules';

/** The recurrence fields one parse run builds. */
export interface EventRecurrenceState {
	date?: string;
	dates?: string[];
	recurring?: string;
	recurringByDay?: string[];
	recurringCount?: number;
	recurringUntil?: string;
	reminderMinutes?: number;
}

/** Monday-first by-day order. */
function orderWeekdays(days: string[]): string[] {
	const order = WEEK_ORDER as readonly string[];
	return [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/**
 * The recurrence table: compound phrases before bare words so the full
 * expression is captured ("every other week", not a fragment).
 * `(?<![\w-])` keeps "annually" from swallowing "bi-annually" — that is
 * twice a year, resolved by the shared cadence table below.
 */
const RECURRENCE_PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
	[/\bmonthly\s+on\s+the\s+\d{1,2}(?:st|nd|rd|th)?\b/i, () => 'monthly'],
	[
		/\bweekly\s+on\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/i,
		() => 'weekly'
	],
	[
		/\bevery other\s+(day|week|month|year)s?\b/i,
		(m) => cadenceToValue({ unit: cadenceUnit(m[1]) ?? 'week', every: 2 })
	],
	[
		/\bevery\s+(\d+)\s+(days?|weeks?|months?|years?)\b/i,
		(m) =>
			cadenceToValue({
				unit: cadenceUnit(m[2]) ?? 'week',
				every: Math.max(1, parseInt(m[1], 10))
			})
	],
	[/\bevery\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, () => 'weekly'],
	[
		/\brepeats?\s+every\s+(day|week|month|year)\b/i,
		(m) => cadenceToValue({ unit: cadenceUnit(m[1]) ?? 'week', every: 1 })
	],
	[
		/\brepeats?\s+(daily|weekly|monthly|yearly|annually)\b/i,
		(m) => (m[1].toLowerCase() === 'annually' ? 'yearly' : m[1].toLowerCase())
	],
	[
		/\bevery\s+(day|week|month|year)s?\b/i,
		(m) => cadenceToValue({ unit: cadenceUnit(m[1]) ?? 'week', every: 1 })
	],
	[/\b(?:daily|every day)\b/i, () => 'daily'],
	[/\bweekly\b/i, () => 'weekly'],
	[/\bmonthly\b/i, () => 'monthly'],
	[/(?<![\w-])(?:yearly|annually)\b/i, () => 'yearly']
];

/**
 * The recurrence family, in legacy order. Reads the claim-masked view for the
 * weekly scan and the bare-weekday fallback (a date claim owns its weekday),
 * and the raw input for the cues, counts, ends and reminders.
 */
export function readEventRecurrence(input: {
	text: string;
	dateInput: string;
	untilMatch: RegExpMatchArray | null;
	now: DateTime;
	claims: ClaimBook;
	stripSpans: string[];
	state: EventRecurrenceState;
	phrases: string[];
}): number[] {
	const { text, dateInput, untilMatch, now, claims, stripSpans, state, phrases } = input;
	const confidence: number[] = [];

	// Compound recurrence cues: one ordered table, first match only.
	for (const [pattern, value] of RECURRENCE_PATTERNS) {
		const m = text.match(pattern);
		if (m) {
			state.recurring = value(m);
			phrases.push(m[0]);
			confidence.push(0.2);
			break;
		}
	}

	// Whatever cadence phrases the rules above do not cover — "quarterly",
	// "twice a year", "every 2 wks", "bi-annually" — come from the SHARED
	// cadence table every parser reads (issue 114). Runs LAST so it can add
	// vocabulary without ever reordering a rule.
	if (!state.recurring) {
		const shared = matchCadence(text);
		if (shared) {
			state.recurring = cadenceToValue(shared.cadence);
			phrases.push(shared.match[0]);
			confidence.push(0.2);
		}
	}

	// Weekday recurrence, single pass over the claim-masked date text.
	const dayTokens = extractDayTokens(claims.mask(dateInput));
	const dayRaws = dayTokens.map((t) => t.raw);
	const distinctDays = [...new Set(dayTokens.map((t) => t.code))];
	const anyPluralDay = dayRaws.some((t) => t.toLowerCase().endsWith('s'));
	const listTrigger = /\b(every|weekly|each)\b/i.test(dateInput);
	// Conjunction-joined pairs ("Monday and Tuesday") name both days even
	// without a trigger word. Commas count too ("Mon, Wed").
	const conjunction = distinctDays.length >= 2 && /\band\b|,|&/.test(dateInput);
	if (distinctDays.length >= 1 && (!state.recurring || state.recurring === 'weekly')) {
		if (listTrigger || anyPluralDay) {
			// A lone dateless weekday ("lunch Monday", no trigger) stays a
			// single event, dated by the fallback below.
			state.recurring = 'weekly';
			state.recurringByDay = orderWeekdays(distinctDays);
			phrases.push(...dayRaws);
			for (const t of dayTokens) claims.claim(t.raw, t.index);
			confidence.push(0.2);
			if (!state.date) {
				state.date = nearestWeekday(distinctDays, now).toFormat('yyyy-MM-dd');
			}
		} else if (conjunction && !state.dates) {
			// Bare pairs name concrete dates — weeklies must be asked for.
			const dates = distinctDays
				.map((d) => nearestWeekday([d], now).toFormat('yyyy-MM-dd'))
				.sort();
			state.dates = dates;
			phrases.push(...dayRaws);
			for (const t of dayTokens) claims.claim(t.raw, t.index);
			confidence.push(0.2);
			if (!state.date) {
				state.date = dates[0];
			}
		}
	}

	// Recurrence end: "for 6 weeks", "for 3 months", "5 times", "8 sessions".
	// A count is meaningless without a frequency.
	const countMatch =
		text.match(/\bfor\s+(\d+)\s+(days?|weeks?|months?|years?|times?|occurrences?|sessions?)\b/i) ??
		text.match(/\b(\d+)\s+times?\b/i);
	if (countMatch && state.recurring) {
		state.recurringCount = Math.max(1, Math.floor(parseInt(countMatch[1])));
		phrases.push(countMatch[0]);
		confidence.push(0.15);
	}

	// Recurrence end: "until Dec 15" (captured early so date parsing cannot
	// steal it). Also meaningless without a frequency.
	if (untilMatch && state.recurring) {
		const untilDate = resolveUntilDate(untilMatch, now);
		if (untilDate) {
			state.recurringUntil = untilDate;
			phrases.push(untilMatch[0]);
			confidence.push(0.15);
		}
	}

	// Bare-weekday fallback ("dinner friday"): no date matched anywhere, so
	// the first named weekday is the event day. Exact names first; typo forms
	// ("wensday") resolve fuzzily with lower weight. Reads only the
	// unclaimed rest (issue 112).
	if (!state.date) {
		const maskedDayInput = claims.mask(dateInput);
		const bareDay = maskedDayInput.match(
			/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
		);
		if (bareDay) {
			const day = bareDay[1].toLowerCase();
			state.date = nextWeekday(day, now);
			confidence.push(0.2);
			stripSpans.push(bareDay[0]);
			claims.claim(bareDay[0], bareDay.index);
		} else {
			const fuzzy = extractDayTokens(maskedDayInput);
			if (fuzzy.length > 0) {
				const name = WEEKDAY_FULL[((WEEK_ORDER as readonly string[]).indexOf(fuzzy[0].code) + 1) % 7];
				state.date = nextWeekday(name, now);
				confidence.push(0.15);
				stripSpans.push(fuzzy[0].raw);
				claims.claim(fuzzy[0].raw, fuzzy[0].index);
			}
		}
	}

	// "weekdays" / "weekends" / "twice a week".
	if (!state.recurring) {
		if (/\bweekdays\b/i.test(text)) {
			state.recurring = 'weekly';
			state.recurringByDay = ['MO', 'TU', 'WE', 'TH', 'FR'];
			phrases.push('weekdays');
			confidence.push(0.2);
			if (!state.date) {
				state.date = nearestWeekday(state.recurringByDay, now).toFormat('yyyy-MM-dd');
			}
		} else if (/\bweekends\b/i.test(text)) {
			state.recurring = 'weekly';
			state.recurringByDay = ['SA', 'SU'];
			phrases.push('weekends');
			confidence.push(0.2);
			if (!state.date) {
				state.date = nearestWeekday(state.recurringByDay, now).toFormat('yyyy-MM-dd');
			}
		} else if (/\btwice\s+a\s+week\b/i.test(text)) {
			// Weekly, but the days are unknowable — never invent them.
			state.recurring = 'weekly';
			phrases.push('twice a week');
			confidence.push(0.2);
		}
	}

	// Reminders: "remind me 30 min before", "reminder 2 hours before".
	const reminderMatch = text.match(
		/(?:remind\s+me|reminder)\s+(\d+)\s+(min(?:ute)?s?|hours?|days?)\s+before\b/i
	);
	if (reminderMatch) {
		const n = parseInt(reminderMatch[1]);
		const unit = reminderMatch[2].toLowerCase();
		state.reminderMinutes = n * (unit.startsWith('min') ? 1 : unit.startsWith('hour') ? 60 : 1440);
		confidence.push(0.15);
		stripSpans.push(reminderMatch[0]);
	}

	return confidence;
}
