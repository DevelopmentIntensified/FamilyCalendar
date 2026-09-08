import { DateTime } from 'luxon';
import nlp from 'compromise';
import {
	applyPeriod,
	dayNumber,
	MONTH_ALT,
	MONTH_MAP,
	normalizeTime
} from '$lib/server/utils/dateParsing';
import { BILL_CATEGORIES, type BillCategory } from '$lib/server/db/schema';
import { categoryForKeyword } from '$lib/data/categories';

export interface ParsedEvent {
	title: string;
	date: string;
	startTime?: string;
	endTime?: string;
	location?: string;
	description?: string;
	allDay: boolean;
	recurring?: string;
	attendants?: string[];
	duration?: string;
	/** Explicit date lists: "sept 23 & 30" → dates for N concrete events. date = dates[0]. */
	dates?: string[];
	/** Weekly day codes (MO..SU) mirroring events.recurrence_by_day. */
	recurringByDay?: string[];
	/** "for 6 weeks" / "10 times" — mirrors events.recurrence_count. */
	recurringCount?: number;
	/** "until Dec 15" — mirrors events.recurrence_until. */
	recurringUntil?: string;
	/** "on the family calendar" — matched against the user's calendars at creation. */
	calendarName?: string;
	/** "remind me 30 min before" — minutes before start. */
	reminderMinutes?: number;
}

export interface ParseResult {
	parsed: Partial<ParsedEvent>;
	confidence: number;
}

const ORDINAL_WORD_MAP = {
	first: 1,
	second: 2,
	third: 3,
	fourth: 4,
	fifth: 5,
	sixth: 6,
	seventh: 7,
	eighth: 8,
	ninth: 9,
	tenth: 10,
	eleventh: 11,
	twelfth: 12,
	thirteenth: 13,
	fourteenth: 14,
	fifteenth: 15,
	sixteenth: 16,
	seventeenth: 17,
	eighteenth: 18,
	nineteenth: 19,
	twentieth: 20,
	'twenty-first': 21,
	'twenty first': 21,
	'twenty-second': 22,
	'twenty second': 22,
	'twenty-third': 23,
	'twenty third': 23,
	twentyfourth: 24,
	'twenty-fourth': 24,
	'twenty fourth': 24,
	'twenty-fifth': 25,
	'twenty fifth': 25,
	'twenty-sixth': 26,
	'twenty sixth': 26,
	'twenty-seventh': 27,
	'twenty seventh': 27,
	'twenty-eighth': 28,
	'twenty eighth': 28,
	'twenty-ninth': 29,
	'twenty ninth': 29,
	thirtieth: 30,
	'thirty-first': 31,
	'thirty first': 31
};

const ORDINAL_WORDS_PATTERN =
	'(?:twenty-(?:first|second|third|fifth|sixth|seventh|eighth|ninth)|thirty-first|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twentyfourth|twentyfifth|twentysixth|twentyseventh|twentyeighth|twentyninth|thirtieth|thirtyfirst)';

function parseDayOfWeek(day: string): number | null {
	return dayNumber(day.toLowerCase()) ?? null;
}

function getNextDayOfWeek(day: string, zone?: string): DateTime {
	const dayNum = parseDayOfWeek(day);
	if (dayNum === null) return DateTime.now();
	const now = zone ? DateTime.now().setZone(zone) : DateTime.now();
	const currentDay = now.weekday % 7;
	let daysUntil = dayNum - currentDay;
	if (daysUntil <= 0) daysUntil += 7;
	return now.plus({ days: daysUntil });
}

/** nth (or last) weekday of a month → DateTime, or null when it can't exist
 * (e.g. a fifth Monday in a 4-Monday month). luxonWeekday: 1=Mon..7=Sun. */
function ordinalWeekdayOfMonth(
	year: number,
	month: number,
	luxonWeekday: number,
	which: 'first' | 'second' | 'third' | 'fourth' | 'fifth' | 'last'
): DateTime | null {
	if (which === 'last') {
		let dt = DateTime.fromObject({ year, month, day: 1 }).endOf('month');
		while (dt.weekday !== luxonWeekday) dt = dt.minus({ days: 1 });
		return dt;
	}
	const n = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 }[which];
	let dt = DateTime.fromObject({ year, month, day: 1 });
	while (dt.weekday !== luxonWeekday) dt = dt.plus({ days: 1 });
	dt = dt.plus({ weeks: n - 1 });
	return dt.month === month ? dt : null;
}

/** Rollover rule shared with month-day parsing: explicit year wins,
 * otherwise this year, rolling to next year when the date sits in the past
 * within a current-or-earlier month. */
function withRolloverYear(
	month: number,
	day: number,
	explicitYear: number | null,
	now: DateTime
): DateTime {
	let year = explicitYear ?? now.year;
	if (!explicitYear && DateTime.fromObject({ year, month, day }) < now && month <= now.month) {
		year += 1;
	}
	return DateTime.fromObject({ year, month, day });
}

/** Weekday abbreviation/full name → RRULE code. Null when unrecognized. */
function normalizeDayToken(t: string): string | null {
	const s = t.toLowerCase();
	if (s.startsWith('mon')) return 'MO';
	if (s.startsWith('tue')) return 'TU';
	if (s.startsWith('wed')) return 'WE';
	if (s.startsWith('thu')) return 'TH';
	if (s.startsWith('fri')) return 'FR';
	if (s.startsWith('sat')) return 'SA';
	if (s.startsWith('sun')) return 'SU';
	return null;
}

/** String-keyed lookup for literal-key maps (keeps exact key types). */
function lookup<K extends string, V>(map: Record<K, V>, key: string): V | undefined {
	// SAFETY: the `in` check pins key to the map's own keys before indexing.
	return key in map ? map[key as K] : undefined;
}

/** Part-of-day word → HH:mm anchor for "returning Sunday morning" phrasings. */
const DAYPART_TIMES = {
	morning: '09:00',
	afternoon: '14:00',
	evening: '18:00',
	noon: '12:00'
};

/** Special time-of-day word → HH:mm. */
const SPECIAL_TIMES = {
	noon: '12:00',
	midnight: '00:00',
	dusk: '20:00',
	dawn: '06:00'
};

/** Time-of-day phrase → HH:mm ("early morning", "afternoon", …). */
const TOD_TIMES = {
	'early morning': '06:00',
	morning: '09:00',
	afternoon: '14:00',
	evening: '18:00'
};

const WEEK_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Recurrence unit word → event-parser recurrence value. */
const UNIT_RECURRENCE = {
	day: 'daily',
	week: 'weekly',
	month: 'monthly',
	year: 'yearly'
} as const;

const FULL_WEEKDAYS = [
	'sunday',
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday'
];

/** Tiny edit distance for typo-tolerant weekday matching (7 words — trivial). */
function editDistance(a: string, b: string): number {
	const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let prev = dp[0];
		dp[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const next = dp[j];
			dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
			prev = next;
		}
	}
	return dp[b.length];
}

/** Map a stray word to a weekday code within typo range. Exact names win
 * immediately (so "monday" never fuzzy-matches "sunday", 2 edits away);
 * otherwise the budget scales with length (≤1 below 7 chars, ≤2 above).
 * Short tokens and month names never qualify. */
function fuzzyDayToken(word: string): string | null {
	const s = word.toLowerCase();
	if (s.length < 4) return null;
	if (MONTH_MAP[s] !== undefined) return null;
	const exact = FULL_WEEKDAYS.indexOf(s);
	if (exact >= 0) return normalizeDayToken(FULL_WEEKDAYS[exact]);
	// Adjacent transpositions ("mondya", "fridya") are single human typos.
	for (let i = 0; i + 1 < s.length; i++) {
		const swapped = s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
		const hit = FULL_WEEKDAYS.indexOf(swapped);
		if (hit >= 0) return normalizeDayToken(FULL_WEEKDAYS[hit]);
	}
	const budget = s.length < 7 ? 1 : 2;
	for (const name of FULL_WEEKDAYS) {
		if (editDistance(s, name) <= budget) return normalizeDayToken(name);
	}
	return null;
}

export interface DayToken {
	raw: string;
	code: string;
	index: number;
}

/** Single weekday-token pass: exact abbreviations first, then a typo scan
 * when fewer than 2 distinct days matched. Exported for unit tests. */
export function extractDayTokens(text: string): DayToken[] {
	const out: DayToken[] = [];
	const seen = new Set<string>();
	const exact = text.matchAll(
		/\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nes|nesday)?|thu(?:r?s?(?:day)?)?|fri(?:day)?|sat(?:ur|urday)?|sun(?:day)?)s?\b/gi
	);
	for (const m of exact) {
		const code = normalizeDayToken(m[1]);
		if (!code) continue;
		out.push({ raw: m[0], code, index: m.index ?? 0 });
		seen.add(code);
	}
	if (seen.size < 2) {
		for (const m of text.matchAll(/\b([a-z]{4,})\b/gi)) {
			const code = fuzzyDayToken(m[1]);
			if (code && !seen.has(code)) {
				out.push({ raw: m[0], code, index: m.index ?? 0 });
				seen.add(code);
			}
		}
	}
	return out.sort((a, b) => a.index - b.index);
}

/** Monday-first ordering for by-day lists. */
function orderWeekdays(days: string[]): string[] {
	return [...days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
}

/** Nearest strictly-future date falling on one of the given day codes. */
function nearestWeekday(days: string[], zone?: string): DateTime {
	const now = zone ? DateTime.now().setZone(zone) : DateTime.now();
	const current = now.weekday; // 1=Mon..7=Sun
	let best = 7;
	for (const d of days) {
		const target = WEEK_ORDER.indexOf(d) + 1;
		let delta = target - current;
		if (delta <= 0) delta += 7;
		if (delta < best) best = delta;
	}
	return now.plus({ days: best });
}

/** Resolve the early-captured "until <date>" match to YYYY-MM-DD. */
function resolveUntilDate(m: RegExpMatchArray, now: DateTime, zone?: string): string | null {
	let dt: DateTime | null = null;
	if (m[1]) {
		dt = DateTime.fromObject({ year: +m[1], month: +m[2], day: +m[3] });
	} else if (m[4]) {
		const month = MONTH_MAP[m[4].toLowerCase()];
		if (month) dt = withRolloverYear(month, parseInt(m[5]), m[6] ? parseInt(m[6]) : null, now);
	} else if (m[7]) {
		const month = MONTH_MAP[m[8].toLowerCase()];
		const day = parseInt(m[7]);
		if (month && day >= 1 && day <= 31) {
			dt = withRolloverYear(month, day, m[9] ? parseInt(m[9]) : null, now);
		}
	} else if (m[11]) {
		dt = getNextDayOfWeek(m[11], zone);
		if (m[10]?.toLowerCase() === 'next') dt = dt.plus({ weeks: 1 });
	}
	return dt?.isValid ? dt.toFormat('yyyy-MM-dd') : null;
}

/** Title stop-words: schedule connectors left after span stripping.
 * Dropped only at the edges or next to punctuation — never mid-title. */
const TITLE_STOP = new Set(['on', 'from', 'for', 'at', 'to', 'and', 'or', '&', 'am', 'pm']);

/** Fan-out ceiling for a date chain ("sept 1 and 2 and 3 …"): one event per
 * date, never a combinatorial blast. */
const MAX_SPAN_DATES = 5;

/** Cosmetic digit-times the parser consumed ("5:30", "9am", "a5pm"). */
const TITLE_TIME_RES = [
	/\b\d{1,2}:\d{2}\s*(?:am|pm)?\s*[-–—]\s*\d{1,2}:\d{2}\s*(?:am|pm)?/gi,
	/\b\d{1,2}:\d{2}\b/g,
	/\ba\s*\d{1,2}(?::?\d{2})?\s*(?:am|pm)\b/gi,
	/\b\d{1,2}\s*(?:am|pm)\b/gi
];

/** Strip consumed schedule spans plus cosmetic digit-times. Spans become
 * DOUBLE spaces so the cleanup below can tell connector words left behind
 * by stripping ("on", "and") from real title words. */
function stripTitleSpans(title: string, phrases: string[]): string {
	let text = title;
	for (const phrase of phrases) {
		const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		text = text.replace(new RegExp(escaped, 'i'), '  ');
	}
	for (const re of TITLE_TIME_RES) text = text.replace(re, '  ');
	return text;
}

/**
 * Drop leftover connectors ("running on   and   at   for fun" -> "running
 * fun"). Double spaces mark where spans were removed: a STOP word beside a
 * gap (or edge/punctuation) goes; mid-title connectors between real words
 * ("fish and chips") stay. Runs until stable (max 3 passes).
 */
function cleanTitleText(title: string): string {
	let text = title;
	for (let pass = 0; pass < 3; pass++) {
		const tokens = text.split(' ');
		const nonEmpty = tokens.filter((t) => t.length > 0);
		const first = nonEmpty[0];
		const last = nonEmpty[nonEmpty.length - 1];
		const kept = tokens.filter((t, i) => {
			if (t === '') return false;
			const core = t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '').toLowerCase();
			if (core === '') return false;
			if (!TITLE_STOP.has(core)) return true;
			const prev = tokens[i - 1] ?? '';
			const next = tokens[i + 1] ?? '';
			const isPunct = (s: string) => s.length > 0 && /^[^a-z0-9]+$/i.test(s);
			if (
				t === first ||
				t === last ||
				t !== core ||
				prev === '' ||
				next === '' ||
				isPunct(prev) ||
				isPunct(next)
			) {
				return false;
			}
			// STOP runs: consecutive STOPs on the squeezed (non-empty)
			// sequence go together ("running on and for fun" loses
			// on/and/for; "fish and chips" keeps its lone and).
			const sqIdx: number[] = [];
			tokens.forEach((x, j) => {
				if (x !== '') sqIdx.push(j);
			});
			const pos = sqIdx.indexOf(i);
			const sqStop = (p: number) => {
				if (p < 0 || p >= sqIdx.length) return false;
				const tok = tokens[sqIdx[p]];
				return TITLE_STOP.has(tok.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '').toLowerCase());
			};
			return !(sqStop(pos - 1) || sqStop(pos + 1));
		});
		const next = kept.join(' ').trimStart();
		if (next === text) return next;
		text = next;
	}
	return text;
}

export function parseEventInput(input: string, zone?: string): ParseResult {
	const result: Partial<ParsedEvent> = { allDay: false };
	let confidence = 0;
	const now = zone ? DateTime.now().setZone(zone) : DateTime.now();
	// Compromise is the heaviest dependency here — never build the doc
	// eagerly. Cheap regex matchers run first; NLP object access goes through
	// getDoc() so parses that resolve without it pay nothing for it.
	let doc: ReturnType<typeof nlp> | null = null;
	const getDoc = () => (doc ??= nlp(nonUrlText));
	const lower = input.toLowerCase();

	// URLs are metadata, not title words: they are captured whole (kept in
	// the description), removed from every downstream text scan, and can
	// never be cut in half by the 50-char title window.
	const urls = (input.match(/https?:\/\/\S+/gi) ?? []).map((u) => u.replace(/[.,;:!?)\]]+$/, ''));
	let nonUrlText = urls.length > 0 ? input.replace(/https?:\/\/\S+/gi, ' ') : input;

	// Early "until <date>" capture (recurrence end): the until-date ends the
	// series, so blank it from date parsing — otherwise month-day rules steal
	// it as the event date ("every Monday until Dec 15" → Dec 15). Resolved
	// into recurringUntil after the recurrence block below.
	const untilMatch = input.match(
		new RegExp(
			`\\buntil\\s+(?:(20\\d{2})-(\\d{2})-(\\d{2})|(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?|(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?(?:,?\\s*(20\\d{2}))?|(?:(this|next)\\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday))\\b`,
			'i'
		)
	);
	const dateInput = untilMatch ? nonUrlText.replace(untilMatch[0], ' ') : nonUrlText;

	// Exact schedule spans consumed by the parser (explicit dates, relative
	// days, reminders, calendar targets). The title step strips these so the
	// title = unmatched text + attendants.
	const stripSpans: string[] = [];

	// Consumed location spans — stripped from the title like schedule, but
	// NOT treated as schedule when deciding whether a "with"-list is
	// title-terminal ("…with nathaniel and jamal at the office" keeps its
	// pinned mid-title list; "…with james and joseph repeat every week" doesn't).
	const titleOnlySpans: string[] = [];

	// ===== DATE PATTERNS =====

	// "this Friday", "this Saturday"
	const thisDayMatch = dateInput.match(
		/\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
	);
	if (thisDayMatch) {
		result.date = getNextDayOfWeek(thisDayMatch[1], zone).toFormat('yyyy-MM-dd');
		stripSpans.push(thisDayMatch[0]);
		confidence += 0.25;
	}

	// "next Wednesday", "next Tuesday"
	const nextDayMatch = dateInput.match(
		/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
	);
	if (nextDayMatch && !result.date) {
		result.date = getNextDayOfWeek(nextDayMatch[1], zone).plus({ weeks: 1 }).toFormat('yyyy-MM-dd');
		stripSpans.push(nextDayMatch[0]);
		confidence += 0.25;
	}

	// "today"
	const todayMatch = dateInput.match(/\btoday\b/i);
	if (todayMatch && !result.date) {
		result.date = now.toFormat('yyyy-MM-dd');
		stripSpans.push(todayMatch[0]);
		confidence += 0.2;
	}

	// "tomorrow"
	const tomorrowMatch = dateInput.match(/\btomorrow\b/i);
	if (tomorrowMatch && !result.date) {
		result.date = now.plus({ days: 1 }).toFormat('yyyy-MM-dd');
		stripSpans.push(tomorrowMatch[0]);
		confidence += 0.2;
	}

	// "in 3 days", "in 2 weeks", "in a month"
	const relativeMatch = dateInput.match(/\bin\s+(a|\d+)\s+(day|week|month)s?\b/i);
	if (relativeMatch && !result.date) {
		const n = relativeMatch[1].toLowerCase() === 'a' ? 1 : parseInt(relativeMatch[1]);
		stripSpans.push(relativeMatch[0]);
		const unit = relativeMatch[2].toLowerCase();
		result.date = (
			unit === 'week'
				? now.plus({ weeks: n })
				: unit === 'month'
					? now.plus({ months: n })
					: now.plus({ days: n })
		).toFormat('yyyy-MM-dd');
		confidence += 0.25;
	}

	// "this weekend", "weekend" -> the upcoming Saturday
	const weekendMatch = dateInput.match(/\b(?:this\s+|next\s+)?weekend\b/i);
	if (weekendMatch && !result.date) {
		let daysUntilSat = (6 - (now.weekday % 7) + 7) % 7;
		if (daysUntilSat === 0) daysUntilSat = 7;
		stripSpans.push(weekendMatch[0]);
		result.date = now.plus({ days: daysUntilSat }).toFormat('yyyy-MM-dd');
		confidence += 0.2;
	}

	// "next <month>" - "next May", "next September" — always next year
	const nextMonthMatch = dateInput.match(new RegExp(`\\bnext\\s+(${MONTH_ALT})\\b`, 'i'));
	if (nextMonthMatch && !result.date) {
		const month = MONTH_MAP[nextMonthMatch[1].toLowerCase()];
		result.date = DateTime.fromObject({ year: now.year + 1, month, day: 1 }).toFormat('yyyy-MM-dd');
		stripSpans.push(nextMonthMatch[0]);
		confidence += 0.2;
	}

	// "returning this Sunday", "returning by Saturday"
	const returnDayMatch = dateInput.match(
		/returning\s+(?:by\s+)?(?:this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+(morning|afternoon|evening|noon))?/i
	);
	if (returnDayMatch && !result.date) {
		result.date = getNextDayOfWeek(returnDayMatch[1], zone).toFormat('yyyy-MM-dd');
		stripSpans.push(returnDayMatch[0]);
		if (returnDayMatch[2]) {
			result.endTime = lookup(DAYPART_TIMES, returnDayMatch[2].toLowerCase()) ?? '18:00';
		}
		confidence += 0.2;
	}

	// Month and day: "July 12th", "Aug 30", "Sept 5", "Dec 25, 2026"
	const monthDayMatch = dateInput.match(
		new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`, 'i')
	);
	if (monthDayMatch && !result.date) {
		const month = MONTH_MAP[monthDayMatch[1].toLowerCase()];
		const day = parseInt(monthDayMatch[2]);
		const target = withRolloverYear(
			month,
			day,
			monthDayMatch[3] ? parseInt(monthDayMatch[3]) : null,
			now
		);
		result.date = target.toFormat('yyyy-MM-dd');
		confidence += 0.3;
	}

	// Day-first with optional year: "21 Mar 2027", "12 August"
	const dayFirstMatch = dateInput.match(
		new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?(?:,?\\s*(20\\d{2}))?\\b`, 'i')
	);
	if (dayFirstMatch && !result.date) {
		const day = parseInt(dayFirstMatch[1]);
		const month = MONTH_MAP[dayFirstMatch[2].toLowerCase()];
		if (day >= 1 && day <= 31) {
			const target = withRolloverYear(
				month,
				day,
				dayFirstMatch[3] ? parseInt(dayFirstMatch[3]) : null,
				now
			);
			result.date = target.toFormat('yyyy-MM-dd');
			confidence += 0.3;
		}
	}

	// ISO date: "2026-08-30"
	const isoDateMatch = dateInput.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
	if (isoDateMatch && !result.date) {
		result.date = `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
		confidence += 0.35;
	}

	// Ordinal-first: "3rd of May", "third of June", "twenty-first of December",
	// "5th of oct" — MONTH_ALT covers full names + abbreviations.
	const ordinalFirstMatch = dateInput.match(
		new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)\\s+of\\s+(${MONTH_ALT})\\b`, 'i')
	);
	if (ordinalFirstMatch && !result.date) {
		const month = MONTH_MAP[ordinalFirstMatch[2].toLowerCase()];
		const day = parseInt(ordinalFirstMatch[1]);
		if (day >= 1 && day <= 31) {
			let year = now.year;
			const target = DateTime.fromObject({ year, month, day });
			if (target < now && month <= now.month) year = now.year + 1;
			result.date = DateTime.fromObject({ year, month, day }).toFormat('yyyy-MM-dd');
			confidence += 0.3;
		}
	}

	// Ordinal word-first: "third of May", "twenty-first of December"
	const ordinalWordMatch = dateInput.match(
		new RegExp(`\\b(${ORDINAL_WORDS_PATTERN})\\s+of\\s+(${MONTH_ALT})\\b`, 'i')
	);
	if (ordinalWordMatch && !result.date) {
		const month = MONTH_MAP[ordinalWordMatch[2].toLowerCase()];
		const rawWord = ordinalWordMatch[1].toLowerCase();
		const normalized = rawWord.replace(/\s+/g, ' ').trim();
		const day = lookup(ORDINAL_WORD_MAP, normalized);
		if (day) {
			let year = now.year;
			const target = DateTime.fromObject({ year, month, day });
			if (target < now && month <= now.month) year = now.year + 1;
			result.date = DateTime.fromObject({ year, month, day }).toFormat('yyyy-MM-dd');
			confidence += 0.3;
		}
	}

	// Ordinal weekday: "first Friday of October", "last Friday of the month".
	const ordinalDayMatch = dateInput.match(
		/\b(first|second|third|fourth|fifth|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+of\s+(the\s+month|january|february|march|april|may|june|july|august|september|october|november|december)\b/i
	);
	if (ordinalDayMatch && !result.date) {
		// SAFETY: the regex above whitelists exactly these ordinal words.
		const which = ordinalDayMatch[1].toLowerCase() as
			| 'first'
			| 'second'
			| 'third'
			| 'fourth'
			| 'fifth'
			| 'last';
		const jsDay = dayNumber(ordinalDayMatch[2].toLowerCase()) ?? 0;
		const luxonDay = jsDay === 0 ? 7 : jsDay;
		const monthToken = ordinalDayMatch[3].toLowerCase();
		let month = monthToken === 'the month' ? now.month : MONTH_MAP[monthToken];
		let year = now.year;
		let target = ordinalWeekdayOfMonth(year, month, luxonDay, which);
		const todayStart = now.startOf('day');
		if (target && target < todayStart) {
			if (monthToken === 'the month') {
				const next = now.plus({ months: 1 });
				month = next.month;
				year = next.year;
			} else {
				year += 1;
			}
			target = ordinalWeekdayOfMonth(year, month, luxonDay, which);
		}
		if (target) {
			result.date = target.toFormat('yyyy-MM-dd');
			confidence += 0.3;
		}
	}

	// Numeric date: "05/03", "12/25" (MM/DD format)
	const numericDateMatch = dateInput.match(/\b(\d{1,2})\/(\d{1,2})\b/);
	if (numericDateMatch && !result.date) {
		const month = parseInt(numericDateMatch[1]);
		const day = parseInt(numericDateMatch[2]);
		let year = now.year;
		const target = DateTime.fromObject({ year, month, day });
		if (target < now) year = now.year + 1;
		result.date = DateTime.fromObject({ year, month, day }).toFormat('yyyy-MM-dd');
		confidence += 0.3;
	}

	// Explicit-date sweep (multi-date + title spans): every calendar date
	// named in the input, not just the first. result.date keeps
	// first-match-wins from the chain above; dates[] covers "sept 23 & 30".
	const explicitDates: Array<{ index: number; date: string; span: string }> = [];
	const pushExplicit = (index: number | undefined, date: string, span: string) => {
		if (index === undefined || !date) return;
		if (!explicitDates.some((e) => e.date === date)) explicitDates.push({ index, date, span });
	};
	let sweep: RegExpExecArray | null;
	const monthDaySweep = new RegExp(
		`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`,
		'gi'
	);
	while ((sweep = monthDaySweep.exec(dateInput)) !== null) {
		const month = MONTH_MAP[sweep[1].toLowerCase()];
		if (month) {
			const dt = withRolloverYear(
				month,
				parseInt(sweep[2]),
				sweep[3] ? parseInt(sweep[3]) : null,
				now
			);
			if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
		}
	}
	const dayFirstSweep = new RegExp(
		`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?(?:,?\\s*(20\\d{2}))?\\b`,
		'gi'
	);
	while ((sweep = dayFirstSweep.exec(dateInput)) !== null) {
		const day = parseInt(sweep[1]);
		const month = MONTH_MAP[sweep[2].toLowerCase()];
		if (month && day >= 1 && day <= 31) {
			const dt = withRolloverYear(month, day, sweep[3] ? parseInt(sweep[3]) : null, now);
			if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
		}
	}
	const isoSweep = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
	while ((sweep = isoSweep.exec(dateInput)) !== null) {
		const dt = DateTime.fromObject({ year: +sweep[1], month: +sweep[2], day: +sweep[3] });
		if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
	}
	const numericSweep = /\b(\d{1,2})\/(\d{1,2})\b/g;
	while ((sweep = numericSweep.exec(dateInput)) !== null) {
		const month = parseInt(sweep[1]);
		const day = parseInt(sweep[2]);
		let year = now.year;
		if (DateTime.fromObject({ year, month, day }) < now) year = now.year + 1;
		const dt = DateTime.fromObject({ year, month, day });
		if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
	}
	const ordinalSweep =
		/\b(\d{1,2})(?:st|nd|rd|th)\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|aug|sep|oct|nov|dec)\b/gi;
	while ((sweep = ordinalSweep.exec(dateInput)) !== null) {
		const month = MONTH_MAP[sweep[2].toLowerCase()];
		const day = parseInt(sweep[1]);
		if (month && day >= 1 && day <= 31) {
			const dt = withRolloverYear(month, day, null, now);
			if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
		}
	}
	const ordinalDaySweep =
		/\b(first|second|third|fourth|fifth|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+of\s+(the\s+month|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;
	while ((sweep = ordinalDaySweep.exec(dateInput)) !== null) {
		// SAFETY: the sweep regex above whitelists exactly these ordinal words.
		const which = sweep[1].toLowerCase() as
			| 'first'
			| 'second'
			| 'third'
			| 'fourth'
			| 'fifth'
			| 'last';
		const jsDay = dayNumber(sweep[2].toLowerCase()) ?? 0;
		const luxonDay = jsDay === 0 ? 7 : jsDay;
		const monthToken = sweep[3].toLowerCase();
		const month = monthToken === 'the month' ? now.month : MONTH_MAP[monthToken];
		let target = ordinalWeekdayOfMonth(now.year, month, luxonDay, which);
		if (target && target < now.startOf('day')) {
			target =
				monthToken === 'the month'
					? ordinalWeekdayOfMonth(
							now.plus({ months: 1 }).year,
							now.plus({ months: 1 }).month,
							luxonDay,
							which
						)
					: ordinalWeekdayOfMonth(now.year + 1, month, luxonDay, which);
		}
		if (target) pushExplicit(sweep.index, target.toFormat('yyyy-MM-dd'), sweep[0]);
	}
	// Continuations ("& 30", ", 12", "and 19") borrow month/year from the
	// nearest preceding explicit date. A following colon marks a time
	// ("sept 9, 08:00 am") — never a day continuation.
	const contSweep = /(?:&|,|\band\b)\s*(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*:)/gi;
	while ((sweep = contSweep.exec(dateInput)) !== null) {
		const day = parseInt(sweep[1]);
		const prior = explicitDates.filter((e) => e.index < sweep!.index).pop();
		if (!prior) continue;
		const base = DateTime.fromISO(prior.date);
		const dt = DateTime.fromObject({ year: base.year, month: base.month, day });
		if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
	}
	explicitDates.sort((a, b) => a.index - b.index);
	// Relative-day atoms ("today", "tomorrow", "yesterday") join the sweep so
	// "today and tomorrow" chains expand like "sept 23 & 30" (issue 030).
	const relDates: Array<{ index: number; date: string; span: string }> = [];
	const relSweep = /\b(today|tomorrow|yesterday)\b/gi;
	while ((sweep = relSweep.exec(dateInput)) !== null) {
		const word = sweep[1].toLowerCase();
		const dt =
			word === 'today' ? now : word === 'tomorrow' ? now.plus({ days: 1 }) : now.minus({ days: 1 });
		relDates.push({ index: sweep.index, date: dt.toFormat('yyyy-MM-dd'), span: sweep[0] });
	}
	// Chain atoms absorb a bridging "the " ("today and the 5th of oct") so the
	// article strips away with the date span. Shifting the index back is safe:
	// a separator (≥2 chars) always sits between chain atoms.
	for (const atom of [...explicitDates, ...relDates]) {
		const pre = dateInput.slice(Math.max(0, atom.index - 4), atom.index);
		const the = /(?:^|\s)(the\s+)$/i.exec(pre);
		if (the) {
			atom.index -= the[1].length;
			atom.span = the[1] + atom.span;
		}
	}
	// A chain is a maximal run of date atoms joined only by list separators
	// (and/,/& — optionally bridging "the"). Every chain of 2+ dates becomes
	// one event per date sharing the parsed time/venue, capped at
	// MAX_SPAN_DATES to keep the fan-out sane.
	const chainAtoms = [...explicitDates, ...relDates].sort((a, b) => a.index - b.index);
	const CHAIN_GAP = /^\s*(?:(?:,|&|\band\b)\s*(?:the\s+)?)*(?:\s*(?:,|&)\s*)?$/i;
	type ChainAtom = { index: number; date: string; span: string };
	const chains: ChainAtom[][] = [];
	let run: ChainAtom[] = [];
	const flushChain = () => {
		if (run.length >= 2) chains.push(run);
		run = [];
	};
	for (const atom of chainAtoms) {
		if (run.length === 0) {
			run = [atom];
			continue;
		}
		const prev = run[run.length - 1];
		const gap = dateInput.slice(prev.index + prev.span.length, atom.index);
		if (CHAIN_GAP.test(gap)) {
			run.push(atom);
		} else {
			flushChain();
			run = [atom];
		}
	}
	flushChain();
	for (const atom of chainAtoms) stripSpans.push(atom.span);
	if (chains.length > 0) {
		const best = chains.reduce((a, b) => (b.length > a.length ? b : a));
		const dates = [...new Set(best.map((e) => e.date))].slice(0, MAX_SPAN_DATES);
		if (dates.length >= 2) {
			result.dates = dates;
			result.date = dates[0];
		}
	}

	// Bare-weekday fallback ("dinner friday"): no date matched anywhere, so
	// the first named weekday is the event day (next occurrence). Exact
	// names first; typo forms ("wensday") resolve fuzzily with lower weight.
	if (!result.date) {
		const bareDay = dateInput.match(
			/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
		);
		if (bareDay) {
			result.date = getNextDayOfWeek(bareDay[1], zone).toFormat('yyyy-MM-dd');
			confidence += 0.2;
			stripSpans.push(bareDay[0]);
		} else {
			const fuzzy = extractDayTokens(dateInput);
			if (fuzzy.length > 0) {
				const name = FULL_WEEKDAYS[(WEEK_ORDER.indexOf(fuzzy[0].code) + 1) % 7];
				result.date = getNextDayOfWeek(name, zone).toFormat('yyyy-MM-dd');
				confidence += 0.15;
				stripSpans.push(fuzzy[0].raw);
			}
		}
	}

	// ===== TIME PATTERNS =====
	let foundTime = false;

	// "6:00PM - 8:00PM" (time range with hyphen) — must check BEFORE standalone time.
	// A missing start meridiem inherits the end one ("5:30-6:30pm" is evening),
	// mirroring the from/to and between rules below.
	const hyphenRangeMatch = input.match(
		/(\d{1,2}):(\d{2})\s*(am?|pm?)?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(am?|pm?)/i
	);
	if (hyphenRangeMatch) {
		let startHour = parseInt(hyphenRangeMatch[1]);
		const startMin = parseInt(hyphenRangeMatch[2]);
		let endHour = parseInt(hyphenRangeMatch[4]);
		const endMin = parseInt(hyphenRangeMatch[5]);
		const startPeriod = hyphenRangeMatch[3]?.toLowerCase();
		const endPeriod = hyphenRangeMatch[6]?.toLowerCase();
		const effectiveStart = startPeriod || endPeriod;
		if (effectiveStart === 'pm' && startHour < 12) startHour += 12;
		if (effectiveStart === 'am' && startHour === 12) startHour = 0;
		if (endPeriod === 'pm' && endHour < 12) endHour += 12;
		if (endPeriod === 'am' && endHour === 12) endHour = 0;
		result.startTime = normalizeTime(startHour, startMin);
		result.endTime = normalizeTime(endHour, endMin);
		foundTime = true;
		confidence += 0.2;
	}

	// "from 2-4pm", "from 9 to 5 pm" (no colons; end carries the meridiem)
	const shortRangeMatch = input.match(
		/\bfrom\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i
	);
	if (shortRangeMatch && !foundTime) {
		const startPeriod = shortRangeMatch[3]?.toLowerCase();
		const endPeriod = shortRangeMatch[6]?.toLowerCase();
		const effectiveStartPeriod = startPeriod || endPeriod;
		result.startTime = normalizeTime(
			applyPeriod(parseInt(shortRangeMatch[1]), effectiveStartPeriod),
			shortRangeMatch[2] ? parseInt(shortRangeMatch[2]) : 0
		);
		result.endTime = normalizeTime(
			applyPeriod(parseInt(shortRangeMatch[4]), endPeriod),
			shortRangeMatch[5] ? parseInt(shortRangeMatch[5]) : 0
		);
		foundTime = true;
		confidence += 0.25;
	}

	// "between 2 and 4 PM"
	const betweenRangeMatch = input.match(
		/\bbetween\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+and\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
	);
	if (betweenRangeMatch && !foundTime) {
		const endPeriod = betweenRangeMatch[6]?.toLowerCase();
		const startPeriod = betweenRangeMatch[3]?.toLowerCase() || endPeriod;
		result.startTime = normalizeTime(
			applyPeriod(parseInt(betweenRangeMatch[1]), startPeriod),
			betweenRangeMatch[2] ? parseInt(betweenRangeMatch[2]) : 0
		);
		result.endTime = normalizeTime(
			applyPeriod(parseInt(betweenRangeMatch[4]), endPeriod),
			betweenRangeMatch[5] ? parseInt(betweenRangeMatch[5]) : 0
		);
		foundTime = true;
		confidence += 0.25;
	}

	// Check all-day first
	if (['all day', 'all-day', 'whole day', 'birthday'].some((p) => lower.includes(p))) {
		result.allDay = true;
		confidence += 0.15;
	}

	// ===== RECURRENCE =====
	// Compound phrases must come before bare words so we capture the full
	// expression ("every other week", not just "week"-less fragments).
	const recurrencePatterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
		[/\bmonthly\s+on\s+the\s+\d{1,2}(?:st|nd|rd|th)?\b/i, () => 'monthly'],
		[
			/\bweekly\s+on\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/i,
			() => 'weekly'
		],
		[/\bevery other\s+(?:day|week|month)\b/i, () => 'biweekly'],
		[
			/\bevery\s+(\d+)\s+(days?|weeks?|months?|years?)\b/i,
			(m) => `every_${m[1]}_${m[2].toLowerCase()}`
		],
		[/\bevery\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, () => 'weekly'],
		// "repeat every week", "repeats weekly" — trailing cues are recurrence,
		// never title text (issue 030). Full span captured so "repeat" leaves.
		[
			/\brepeats?\s+every\s+(day|week|month|year)\b/i,
			(m) => lookup(UNIT_RECURRENCE, m[1].toLowerCase()) ?? 'weekly'
		],
		[
			/\brepeats?\s+(daily|weekly|monthly|yearly|annually)\b/i,
			(m) => (m[1].toLowerCase() === 'annually' ? 'yearly' : m[1].toLowerCase())
		],
		[
			/\bevery\s+(day|week|month|year)s?\b/i,
			(m) => lookup(UNIT_RECURRENCE, m[1].toLowerCase()) ?? 'weekly'
		],
		[/\b(?:daily|every day)\b/i, () => 'daily'],
		[/\bweekly\b/i, () => 'weekly'],
		[/\bmonthly\b/i, () => 'monthly'],
		[/\b(?:yearly|annually)\b/i, () => 'yearly']
	];
	const recurrencePhrases: string[] = [];
	for (const [pattern, value] of recurrencePatterns) {
		const m = input.match(pattern);
		if (m) {
			result.recurring = value(m);
			recurrencePhrases.push(m[0]);
			confidence += 0.2;
			break;
		}
	}

	// Weekday recurrence, single pass: "every Monday", "on wednesdays",
	// "every Mon, Wed, Fri", "tuesday and thrusday" (typo-tolerant). One
	// token scan over dateInput (until-span blanked) feeds every rule below.
	const dayTokens = extractDayTokens(dateInput);
	const dayRaws = dayTokens.map((t) => t.raw);
	const distinctDays = [...new Set(dayTokens.map((t) => t.code))];
	const anyPluralDay = dayRaws.some((t) => t.toLowerCase().endsWith('s'));
	const listTrigger = /\b(every|weekly|each)\b/i.test(dateInput);
	// Conjunction-joined pairs ("Monday and Tuesday") name both days even
	// without a trigger word. Commas count too ("Mon, Wed").
	const conjunction = distinctDays.length >= 2 && /\band\b|,|&/.test(dateInput);
	if (distinctDays.length >= 1 && (!result.recurring || result.recurring === 'weekly')) {
		if (listTrigger || anyPluralDay) {
			// Note: a lone dateless weekday ("lunch Monday", no trigger) fails
			// the condition and stays a single event (dated by the fallback).
			result.recurring = 'weekly';
			result.recurringByDay = orderWeekdays(distinctDays);
			recurrencePhrases.push(...dayRaws);
			confidence += 0.2;
			if (!result.date) {
				result.date = nearestWeekday(distinctDays, zone).toFormat('yyyy-MM-dd');
			}
		} else if (conjunction && !result.dates) {
			// Bare pairs name concrete dates — weeklies need to be asked
			// for ("every", plural). One upcoming date per listed day.
			const dates = distinctDays
				.map((d) => nearestWeekday([d], zone).toFormat('yyyy-MM-dd'))
				.sort();
			result.dates = dates;
			recurrencePhrases.push(...dayRaws);
			confidence += 0.2;
			if (!result.date) {
				result.date = dates[0];
			}
		}
	}

	// Recurrence end: "for 6 weeks", "for 3 months", "5 times", "8 sessions".
	// Count is meaningless without a frequency, so a bare "buy milk 2 times"
	// or "party in 2 weeks" never sets it.
	const countMatch =
		input.match(/\bfor\s+(\d+)\s+(days?|weeks?|months?|years?|times?|occurrences?|sessions?)\b/i) ??
		input.match(/\b(\d+)\s+times?\b/i);
	if (countMatch && result.recurring) {
		result.recurringCount = Math.max(1, Math.floor(parseInt(countMatch[1])));
		recurrencePhrases.push(countMatch[0]);
		confidence += 0.15;
	}

	// Recurrence end: "until Dec 15" (captured early so date parsing can't
	// steal it). Also meaningless without a frequency.
	if (untilMatch && result.recurring) {
		const untilDate = resolveUntilDate(untilMatch, now, zone);
		if (untilDate) {
			result.recurringUntil = untilDate;
			recurrencePhrases.push(untilMatch[0]);
			confidence += 0.15;
		}
	}

	// "weekdays" / "weekends" / "twice a week" — the unified block above
	// already handled explicit day names; these shorthands remain here.
	if (!result.recurring) {
		if (/\bweekdays\b/i.test(input)) {
			result.recurring = 'weekly';
			result.recurringByDay = ['MO', 'TU', 'WE', 'TH', 'FR'];
			recurrencePhrases.push('weekdays');
			confidence += 0.2;
			if (!result.date) {
				result.date = nearestWeekday(result.recurringByDay, zone).toFormat('yyyy-MM-dd');
			}
		} else if (/\bweekends\b/i.test(input)) {
			result.recurring = 'weekly';
			result.recurringByDay = ['SA', 'SU'];
			recurrencePhrases.push('weekends');
			confidence += 0.2;
			if (!result.date) {
				result.date = nearestWeekday(result.recurringByDay, zone).toFormat('yyyy-MM-dd');
			}
		} else if (/\btwice\s+a\s+week\b/i.test(input)) {
			// Weekly, but the days are unknowable — never invent them.
			result.recurring = 'weekly';
			recurrencePhrases.push('twice a week');
			confidence += 0.2;
		}
	}

	// Reminders: "remind me 30 min before", "reminder 2 hours before".
	const reminderMatch = input.match(
		/(?:remind\s+me|reminder)\s+(\d+)\s+(min(?:ute)?s?|hours?|days?)\s+before\b/i
	);
	if (reminderMatch) {
		const n = parseInt(reminderMatch[1]);
		const unit = reminderMatch[2].toLowerCase();
		result.reminderMinutes = n * (unit.startsWith('min') ? 1 : unit.startsWith('hour') ? 60 : 1440);
		confidence += 0.15;
		stripSpans.push(reminderMatch[0]);
	}

	// "starting at 6 PM", "at 8 AM", "beginning at 9 AM", "7:15A"
	// (?!\d) keeps bare 4-digit military time ("1830") from matching here.
	const startTimeMatch = input.match(
		/(?:start(?:ing)?\s+at|at|beginning\s+at)\s+(\d{1,2})(?::(\d{2}))?(?!\d)\s*(am?|pm?|AM?|PM?)?/i
	);

	// Standalone time: "9:00 AM", "7:15P", "3:30 PM" (may appear after date).
	// Bare meridiem form without colon or "at" ("mon and tue 6am") follows.
	if (!startTimeMatch && !foundTime) {
		const standaloneTimeMatch = input.match(/\b(\d{1,2}):(\d{2})\s*(am?|pm?|AM?|PM?)\b/i);
		// Bare meridiem time without colon or "at" ("mon and tue 6am").
		const bareMeridiemMatch = standaloneTimeMatch
			? null
			: input.match(/(?<![\d:])(\d{1,2})\s*(am|pm)\b/i);
		const timeMatch: RegExpMatchArray | null = standaloneTimeMatch ?? bareMeridiemMatch;
		const isColonTime = standaloneTimeMatch !== null;
		if (timeMatch) {
			let hour = parseInt(timeMatch[1]);
			let minute = 0;
			let period: string | undefined;
			if (isColonTime && standaloneTimeMatch) {
				minute = parseInt(standaloneTimeMatch[2]);
				period = standaloneTimeMatch[3]?.toLowerCase();
			} else if (bareMeridiemMatch) {
				// SAFETY: bareMeridiemMatch has exactly the two groups (hour, am|pm).
				period = bareMeridiemMatch[2].toLowerCase();
			}
			if (period === 'pm' && hour < 12) hour += 12;
			if (period === 'am' && hour === 12) hour = 0;
			result.startTime = normalizeTime(hour, minute);
			foundTime = true;
			confidence += 0.25;
		}
	}
	if (startTimeMatch) {
		let hour = parseInt(startTimeMatch[1]);
		const minute = startTimeMatch[2] ? parseInt(startTimeMatch[2]) : 0;
		const period = startTimeMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		if (period === 'am' && hour === 12) hour = 0;
		if (!period && hour < 8) hour += 12;
		result.startTime = normalizeTime(hour, minute);
		foundTime = true;
		confidence += 0.25;
	}

	// Special times: "at noon", "at midnight", "at dusk", "at dawn"
	const specialTimeMatch = input.match(/\bat\s+(noon|midnight|dusk|dawn)\b/i);
	if (specialTimeMatch && !foundTime) {
		result.startTime = lookup(SPECIAL_TIMES, specialTimeMatch[1].toLowerCase());
		foundTime = true;
		confidence += 0.2;
	}

	// Colloquial fractions: "half past seven pm", "quarter to nine am", "quarter past two pm"
	const WORD_HOUR = {
		one: 1,
		two: 2,
		three: 3,
		four: 4,
		five: 5,
		six: 6,
		seven: 7,
		eight: 8,
		nine: 9,
		ten: 10,
		eleven: 11,
		twelve: 12
	};
	const colloquialMatch = input.match(
		new RegExp(
			`\\b(half\\s+past|quarter\\s+to|quarter\\s+past)\\s+(\\d{1,2}|${Object.keys(WORD_HOUR).join('|')})\\s*(am|pm)?\\b`,
			'i'
		)
	);
	if (colloquialMatch && !foundTime) {
		const kind = colloquialMatch[1].toLowerCase().replace(/\s+/g, ' ');
		const rawHour = colloquialMatch[2].toLowerCase();
		const hour = /^\d+$/.test(rawHour) ? parseInt(rawHour) : (lookup(WORD_HOUR, rawHour) ?? 0);
		const period = colloquialMatch[3]?.toLowerCase();
		if (kind === 'half past') {
			result.startTime = normalizeTime(applyPeriod(hour, period), 30);
		} else if (kind === 'quarter past') {
			result.startTime = normalizeTime(applyPeriod(hour, period), 15);
		} else {
			// quarter TO nine = 8:45
			result.startTime = normalizeTime(applyPeriod(hour - 1, period), 45);
		}
		foundTime = true;
		confidence += 0.25;
	}

	// Military / compact 24h: "1830" (not years like 2026). Runs on URL-free
	// text so digit runs inside links never read as times.
	const militaryMatch = nonUrlText.match(/(?<![\d:])(\d{2})(\d{2})(?!\d)/);
	if (militaryMatch && !foundTime) {
		const whole = militaryMatch[0];
		const hh = parseInt(militaryMatch[1]);
		const mm = parseInt(militaryMatch[2]);
		if (!/^20\d{2}$/.test(whole) && hh <= 23 && mm <= 59) {
			result.startTime = normalizeTime(hh, mm);
			foundTime = true;
			confidence += 0.25;
		}
	}

	// Time of day: "early morning", "morning", "afternoon", "evening"
	const timeOfDayMatch = input.match(/\b(early\s+morning|morning|afternoon|evening)\b/i);
	if (timeOfDayMatch && !foundTime) {
		result.startTime = lookup(TOD_TIMES, timeOfDayMatch[1].toLowerCase());
		foundTime = true;
		confidence += 0.15;
	}

	// "kicking off at 5 PM"
	const kickOffMatch = input.match(
		/kicking\s+off\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i
	);
	if (kickOffMatch && !foundTime) {
		let hour = parseInt(kickOffMatch[1]);
		const period = kickOffMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.startTime = normalizeTime(hour);
		foundTime = true;
		confidence += 0.2;
	}

	// "departing at 5 AM", "leaving at 6 AM"
	const leaveMatch = input.match(
		/(?:leaving|departing)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i
	);
	if (leaveMatch && !foundTime) {
		let hour = parseInt(leaveMatch[1]);
		const minute = leaveMatch[2] ? parseInt(leaveMatch[2]) : 0;
		const period = leaveMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		if (period === 'am' && hour === 12) hour = 0;
		result.startTime = normalizeTime(hour, minute);
		foundTime = true;
		confidence += 0.2;
	}

	// "arriving at 10 AM", "arriving by 1 PM"
	const arriveMatch = input.match(/arriving\s+(?:at|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i);
	if (arriveMatch && !foundTime) {
		let hour = parseInt(arriveMatch[1]);
		const minute = arriveMatch[2] ? parseInt(arriveMatch[2]) : 0;
		const period = arriveMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.startTime = normalizeTime(hour, minute);
		foundTime = true;
		confidence += 0.2;
	}

	// Glued/spelled article times: "a5pm", "a830am", "a 9pm" (typo for "at").
	// The meridiem is mandatory so "a 5 minute break" and "a 5k run" never match.
	const articleTimeMatch = input.match(/\ba\s*(\d{1,2})(?::?(\d{2}))?\s*(am|pm)\b/i);
	if (articleTimeMatch && !foundTime) {
		let hour = parseInt(articleTimeMatch[1]);
		const minute = articleTimeMatch[2] ? parseInt(articleTimeMatch[2]) : 0;
		const period = articleTimeMatch[3].toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		if (period === 'am' && hour === 12) hour = 0;
		result.startTime = normalizeTime(hour, minute);
		foundTime = true;
		confidence += 0.2;
	}

	// "from 9 AM to 5 PM"
	const fromToMatch = input.match(
		/from\s+(\d{1,2})(?:(?::(\d{2})))?\s*(am?|pm?)?\s+to\s+(\d{1,2})(?:(?::(\d{2})))?\s*(am?|pm?)?/i
	);
	if (fromToMatch && !foundTime) {
		let startHour = parseInt(fromToMatch[1]);
		const startMin = fromToMatch[2] ? parseInt(fromToMatch[2]) : 0;
		let endHour = parseInt(fromToMatch[4]);
		const endMin = fromToMatch[5] ? parseInt(fromToMatch[5]) : 0;
		const startPeriod = fromToMatch[3]?.toLowerCase();
		const endPeriod = fromToMatch[6]?.toLowerCase();
		if (startPeriod === 'pm' && startHour < 12) startHour += 12;
		if (startPeriod === 'am' && startHour === 12) startHour = 0;
		if (endPeriod === 'pm' && endHour < 12) endHour += 12;
		if (endPeriod === 'am' && endHour === 12) endHour = 0;
		result.startTime = normalizeTime(startHour, startMin);
		result.endTime = normalizeTime(endHour, endMin);
		foundTime = true;
		confidence += 0.2;
	}

	// End time: "wrapping up around 9 PM"
	const wrapMatch = input.match(/wrapping\s+up\s+(?:around\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (wrapMatch && !result.endTime) {
		let hour = parseInt(wrapMatch[1]);
		const period = wrapMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.endTime = normalizeTime(hour);
		confidence += 0.15;
	}

	// "finishing around 11 AM", "finishes around 11 AM", "finishing at 7 AM", "concludes at 7 AM"
	const finishMatch = input.match(
		/(?:finishes?(?:\s+around\s+)?|(?:finishing|concludes?)(?:\s+at\s+)?)(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i
	);
	if (finishMatch && !result.endTime) {
		let hour = parseInt(finishMatch[1]);
		const period = finishMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.endTime = normalizeTime(hour);
		confidence += 0.15;
	}

	// "going on until 9 PM", "continuing until 9 PM"
	const continueMatch = input.match(
		/(?:going\s+on|continuing)\s+until\s+(?:around\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i
	);
	if (continueMatch && !result.endTime) {
		let hour = parseInt(continueMatch[1]);
		const period = continueMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.endTime = normalizeTime(hour);
		confidence += 0.15;
	}

	// "staying until sunset", "staying until dusk"
	if (lower.includes('staying until') && (lower.includes('sunset') || lower.includes('dusk'))) {
		result.endTime = '20:00';
		confidence += 0.1;
	}

	// "running late", "going until we fall asleep"
	if ((lower.includes('running late') || lower.includes('going until we')) && !result.endTime) {
		result.endTime = '23:00';
		confidence += 0.1;
	}

	// "until midnight"
	const untilMidnightMatch = input.match(/until\s+midnight/i);
	if (untilMidnightMatch && !result.endTime) {
		result.endTime = '00:00';
		confidence += 0.1;
	}

	// Duration: "for 2 hours", "for 15 minutes", "for about 15 min", "about 15 min"
	const hourDurMatch = input.match(/for\s+(?:about\s+)?(\d+)\s+(hours?|hrs?|hr)\b/i);
	const minDurMatch = input.match(/for\s+(?:about\s+)?(\d+)\s+(minutes?|mins?|min)\b/i);

	if (result.startTime && !result.endTime) {
		const start = DateTime.fromFormat(result.startTime, 'HH:mm');
		if (minDurMatch) {
			const minutes = parseInt(minDurMatch[1]);
			result.endTime = start.plus({ minutes }).toFormat('HH:mm');
			confidence += 0.1;
		} else if (hourDurMatch) {
			const hours = parseInt(hourDurMatch[1]);
			result.endTime = start.plus({ hours }).toFormat('HH:mm');
			confidence += 0.1;
		}
	}

	// Also check standalone "about X min/hr" (without "for")
	if (result.startTime && !result.endTime) {
		const aboutDurMatch = input.match(/about\s+(\d+)\s+(minutes?|mins?|min|hours?|hrs?|hr)\b/i);
		if (aboutDurMatch) {
			const start = DateTime.fromFormat(result.startTime, 'HH:mm');
			const amount = parseInt(aboutDurMatch[1]);
			if (aboutDurMatch[2].toLowerCase().startsWith('h')) {
				result.endTime = start.plus({ hours: amount }).toFormat('HH:mm');
			} else {
				result.endTime = start.plus({ minutes: amount }).toFormat('HH:mm');
			}
			confidence += 0.1;
		}
	}

	// Also check "lasting for X minutes/hours" or "lasting about X minutes"
	const lastingMatch = input.match(
		/lasting\s+(?:for\s+)?(?:about\s+)?(\d+)\s+(minutes?|mins?|min|hours?|hrs?|hr)\b/i
	);
	if (lastingMatch && result.startTime && !result.endTime) {
		const start = DateTime.fromFormat(result.startTime, 'HH:mm');
		const amount = parseInt(lastingMatch[1]);
		if (lastingMatch[2].toLowerCase().startsWith('h')) {
			result.endTime = start.plus({ hours: amount }).toFormat('HH:mm');
		} else {
			result.endTime = start.plus({ minutes: amount }).toFormat('HH:mm');
		}
		confidence += 0.1;
	}

	// "closing at 6 PM", "ending at 4 PM"
	const closeMatch = input.match(
		/(?:closing|ending)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i
	);
	if (closeMatch && !result.endTime) {
		let hour = parseInt(closeMatch[1]);
		const period = closeMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.endTime = normalizeTime(hour);
		confidence += 0.15;
	}

	// "opening at 11 AM"
	const openMatch = input.match(/opening\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i);
	if (openMatch && !foundTime) {
		let hour = parseInt(openMatch[1]);
		const period = openMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.startTime = normalizeTime(hour);
		foundTime = true;
		confidence += 0.15;
	}

	// "ends at 9 PM", "ends at around 8 PM", "finishing at 10 PM" → end time
	const endsAtMatch = input.match(
		/(?:ends?|finishing)\s+(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)/i
	);
	if (endsAtMatch && !result.endTime) {
		let hour = parseInt(endsAtMatch[1]);
		const minute = endsAtMatch[2] ? parseInt(endsAtMatch[2]) : 0;
		const ampm = endsAtMatch[3].toLowerCase();
		if (ampm === 'pm' && hour < 12) hour += 12;
		if (ampm === 'am' && hour === 12) hour = 0;
		result.endTime = normalizeTime(hour, minute);
		confidence += 0.2;
	}

	// "till 5 PM", "till 18:00", "until 9 PM" → end time
	const tillMatch = input.match(/\b(?:till|until)\s+(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)/i);
	if (tillMatch && !result.endTime) {
		let hour = parseInt(tillMatch[1]);
		const minute = tillMatch[2] ? parseInt(tillMatch[2]) : 0;
		const ampm = tillMatch[3].toLowerCase();
		if (ampm === 'pm' && hour < 12) hour += 12;
		if (ampm === 'am' && hour === 12) hour = 0;
		result.endTime = normalizeTime(hour, minute);
		confidence += 0.2;
		stripSpans.push(tillMatch[0]);
	}

	// "returning by 2 PM", "back by 6 PM" → end time
	const returnByMatch = input.match(
		/(?:returning|back)\s+by\s+(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)/i
	);
	if (returnByMatch && !result.endTime) {
		let hour = parseInt(returnByMatch[1]);
		const minute = returnByMatch[2] ? parseInt(returnByMatch[2]) : 0;
		const ampm = returnByMatch[3].toLowerCase();
		if (ampm === 'pm' && hour < 12) hour += 12;
		if (ampm === 'am' && hour === 12) hour = 0;
		result.endTime = normalizeTime(hour, minute);
		confidence += 0.2;
	}

	// ===== LOCATION PATTERNS =====

	// "Location: X" or "location: X" - explicit location keyword (highest priority)
	const explicitLocMatch = nonUrlText.match(
		/\blocation\s*:\s*(.+?)(?:\n|$|type:|date:|time:|description:)/i
	);
	if (explicitLocMatch) {
		result.location = explicitLocMatch[1].trim();
		confidence += 0.25;
	}

	// "location at X" or "location is X"
	const locKeywordMatch = nonUrlText.match(/\blocation\s+(?:at|is|in)\s+([A-Za-z][a-z0-9 ]*)/i);
	if (locKeywordMatch && !result.location) {
		result.location = locKeywordMatch[1].trim();
		confidence += 0.2;
		titleOnlySpans.push(locKeywordMatch[0]);
	}

	// "at X" where X is a short uppercase token (e.g. "at LU", "at HR")
	const atShortLocMatch = nonUrlText.match(/\bat\s+([A-Z]{1,4})\b/);
	if (atShortLocMatch && !result.location) {
		result.location = atShortLocMatch[1];
		confidence += 0.15;
		titleOnlySpans.push(atShortLocMatch[0]);
	}

	// Street address: "442 cherry hill dr., rustburg, va 24588" — the whole
	// thing, not a compromise-places fragment. The street type must end at a
	// word boundary (so "st" never matches inside "studio"), the bridge to
	// it stays short and never carries a meridiem (so "7 PM and running
	// until midnight at my apartment on 42 Maple Drive" captures only "42
	// Maple Drive"), and times/counts never match.
	const streetAddressMatch = nonUrlText.match(
		/\b(\d{1,6}\s+(?:(?!am\b|pm\b)[A-Za-z0-9.'#-]+\s+){0,4}?(?:street|st|drive|dr|avenue|ave|road|rd|lane|ln|court|ct|boulevard|blvd|way|circle|cir|place|pl|terrace|trail|parkway|highway|hwy)\b\.?(?:\s*,\s*[A-Za-z][A-Za-z .'-]*,\s*[A-Za-z]{2}\s+\d{5}(?:-\d{4})?)?)/i
	);
	if (streetAddressMatch && !result.location) {
		result.location = streetAddressMatch[1].trim();
		confidence += 0.2;
		stripSpans.push(streetAddressMatch[1]);
	}

	// Compromise places, lazily and only as a fallback: explicit locations
	// ("location: X", "at X") already won above and must not be overwritten.
	if (!result.location) {
		const places = getDoc().places().out('array');
		if (places.length > 0) {
			result.location = places[0];
			confidence += 0.15;
			// The place name is consumed metadata — keep it out of the title.
			titleOnlySpans.push(places[0]);
		}
	}

	// "at the X" - capture multi-word locations like "neighborhood clubhouse", "yoga studio"
	const atLocMatch = nonUrlText.match(/at\s+the\s+([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)*)/);
	if (atLocMatch && !result.location) {
		let loc = atLocMatch[1];
		// Stop at conjunctions/prepositions
		loc = loc.replace(/\s+(?:and|but|with|for|to|by|because|since)\s+.*$/, '');
		result.location = loc;
		confidence += 0.15;
		titleOnlySpans.push(atLocMatch[0]);
	}

	// "in the X" - capture locations like "downtown square"
	const inLocMatch = nonUrlText.match(/in\s+the\s+([a-z]+(?:\s+[a-z]+)*)/i);
	if (inLocMatch && !result.location) {
		result.location = inLocMatch[1];
		confidence += 0.15;
		titleOnlySpans.push(inLocMatch[0]);
	}

	// "at home"
	const atHomeMatch = nonUrlText.match(/\bat\s+home\b/i);
	if (atHomeMatch && !result.location) {
		result.location = 'Home';
		confidence += 0.1;
		titleOnlySpans.push(atHomeMatch[0]);
	}

	// "at my apartment on 42 Maple Drive" or "at my apartment"
	const myPlaceMatch = nonUrlText.match(
		/at\s+(?:my|our)\s+([a-z]+)(?:\s+on\s+(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*))?/i
	);
	if (myPlaceMatch && !result.location) {
		if (myPlaceMatch[2]) {
			// Has address after "on"
			result.location = myPlaceMatch[2].trim();
		} else {
			result.location = myPlaceMatch[1]
				? myPlaceMatch[1].charAt(0).toUpperCase() + myPlaceMatch[1].slice(1)
				: 'Home';
		}
		confidence += 0.1;
		titleOnlySpans.push(myPlaceMatch[0]);
	}

	// Address: "at 450 Main Street" or standalone address
	// Match address pattern: number + street name, possibly after "on"
	const addressMatch = nonUrlText.match(/\bon\s+(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
	if (addressMatch && !result.location) {
		result.location = addressMatch[1].trim();
		confidence += 0.15;
		titleOnlySpans.push(addressMatch[0]);
	}

	// "at X studio", "at X center", "at X park" - general location patterns
	const generalLocMatch = nonUrlText.match(
		/at\s+(?:the\s+)?([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)*\s+(?:studio|center|park|garden|square|clubhouse|trailhead))/i
	);
	if (generalLocMatch && !result.location) {
		result.location = generalLocMatch[1].trim();
		confidence += 0.15;
		titleOnlySpans.push(generalLocMatch[0]);
	}

	// Strip trailing punctuation from location
	if (result.location) {
		result.location = result.location.replace(/[.,;:!?]+$/, '');
	}

	// Calendar targeting: "on the family calendar", "to my work calendar".
	// Stores the raw name; the caller matches it against the user's calendars.
	const calendarMatch = nonUrlText.match(
		/\b(?:on|to)\s+(?:the\s+|my\s+)?([A-Za-z][A-Za-z ]*?)\s+calendar\b/i
	);
	if (calendarMatch) {
		result.calendarName = `${calendarMatch[1].trim()} calendar`;
		confidence += 0.15;
		stripSpans.push(calendarMatch[0]);
	}

	// Bare routing: "stalkers campout family calendar" / "family calendar
	// stalkers campout" — the household defaults ("family", "personal") are
	// safe to route without an on/to preposition; arbitrary calendar names
	// still need "on"/"to" to avoid over-capture ("budget calendar review").
	const bareCalendarMatch =
		!result.calendarName && nonUrlText.match(/\b(family|personal)\s+calendar\s*[.!]?\s*$/i);
	const leadingCalendarMatch =
		!result.calendarName && nonUrlText.match(/^(?:the\s+|my\s+)?(family|personal)\s+calendar\b/i);
	const bareMatch = bareCalendarMatch ?? leadingCalendarMatch;
	if (bareMatch) {
		// SAFETY: the alternation above whitelists family|personal only.
		result.calendarName = `${bareMatch[1]} calendar`;
		confidence += 0.15;
		stripSpans.push(bareMatch[0]);
	}

	// ===== ATTENDANT PATTERNS =====
	// Cheap matchers first; compromise people() runs last and only when
	// nothing matched, so most parses never pay for a second NLP doc.

	// "with X", "with X and Y and Z" — explicit lists are the trustworthy
	// source. Continuations only extend on and/&/comma so prepositions end
	// the list ("with John at the park" captures John, not "at the park").
	// Lowercase names validate against compromise's person lexicon (one hit
	// admits the list) so "with pizza and drinks" never reads as people.
	const withMatch = nonUrlText.matchAll(
		/\bwith\s+([A-Za-z][A-Za-z'’-]*(?:(?:\s+and\s+|\s*&\s*|\s*,\s*)[A-Za-z][A-Za-z'’-]*)*)/gi
	);
	let withSpan: { text: string; end: number } | null = null;
	for (const m of withMatch) {
		const items = m[1]
			.split(/\s*(?:,|\band\b|&)\s*/i)
			.map((n) => n.trim())
			.filter((n) => n.length > 0)
			// Articles lead common-noun groups ("with jay and the league").
			.filter((n) => !/^(?:the|a|an)\b/i.test(n))
			.filter((n) => n.split(/\s+/).length <= 2);
		if (items.length === 0) continue;
		const lowerItems = items.filter((n) => /^[a-z]/.test(n));
		if (lowerItems.length > 0 && !lowerItems.some((n) => nlp(n).people().out('array').length > 0)) {
			continue;
		}
		if (!result.attendants || result.attendants.length === 0) {
			result.attendants = items;
			confidence += 0.15;
		} else {
			for (const n of items) {
				if (!result.attendants.some((a) => a.toLowerCase() === n.toLowerCase())) {
					result.attendants.push(n);
				}
			}
		}
		withSpan = { text: m[0], end: (m.index ?? 0) + m[0].length };
		break;
	}

	// A "with"-list that runs to the end of the title (everything after it is
	// schedule — recurrence cues, dates, times) is attendance, not the event
	// name: blank it from the remaining text so the title never carries it.
	// Mid-title lists keep their pin ("…with nathan") — only terminal lists go.
	if (withSpan) {
		let tail = nonUrlText.slice(withSpan.end);
		for (const phrase of [...recurrencePhrases, ...stripSpans]) {
			const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			tail = tail.replace(new RegExp(escaped, 'i'), ' ');
		}
		if (/^[\s.,;:!-]*$/.test(tail)) {
			const escapedSpan = withSpan.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			nonUrlText = nonUrlText.replace(new RegExp(escapedSpan, 'i'), '  ');
		}
	}

	// "invite X" / "invite Jay and Mo" — explicit beats guessed.
	const inviteMatch = nonUrlText.match(/\binvite\s+([^,.]+)/i);
	if (inviteMatch) {
		const raw = inviteMatch[1]
			.replace(/\s+(?:on|at|for|from|to|until|remind|reminder)\b.*$/i, '')
			.trim();
		const names = raw
			.split(/\s+and\s+|,/i)
			.map((n) => n.trim())
			.filter((n) => n.length > 0);
		if (names.length > 0) {
			const merged = [...(result.attendants ?? [])];
			for (const n of names) {
				if (!merged.some((m) => m.toLowerCase() === n.toLowerCase())) merged.push(n);
			}
			result.attendants = merged;
			confidence += 0.15;
		}
	}

	// Speaker patterns: "Alex and I", "My sister and I", "The team and I"
	const speakerPatterns = [
		/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+I\s+(?:are|will|would|having|hosting|throwing|planning|organizing|going|traveling|performing|reviewing|putting|launching)\b[^.]*/i,
		/(You\s+and\s+I\s+(?:and\s+the\s+rest\s+of\s+)?[^.]+)/i,
		/(Us\s+(?:three\s+)?[a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+and\s+the\s+[a-z]+)?\s+(?:are|will|going|having|hosting|putting))/i,
		/(Our\s+[a-z]+(?:\s+[a-z]+)*\s+and\s+I\s+(?:are|will|having|hosting|throwing|planning|organizing|going|traveling|performing|reviewing))/i,
		/(The\s+[a-z]+(?:\s+[a-z]+)*\s+and\s+I\s+(?:are|will|having|hosting|throwing|planning|organizing|going|traveling|reviewing|clean|having))/i,
		/(My\s+[a-z]+(?:\s+[a-z]+)*\s+and\s+I\s+(?:are|will|having|hosting|throwing|planning|organizing|going|traveling))/i
	];

	if (!result.attendants || result.attendants.length === 0) {
		for (const pattern of speakerPatterns) {
			const match = nonUrlText.match(pattern);
			if (match && match[1] && match[1].length > 3 && match[1].length < 80) {
				const peoplePart = match[1]
					.replace(
						/\s+(are|will|would|having|hosting|throwing|planning|organizing|going|traveling|performing|reviewing|putting|launching|hit|hitting|clean|having|putting)\s*$/i,
						''
					)
					.trim();
				if (peoplePart.length > 3) {
					result.attendants = [peoplePart];
					confidence += 0.15;
					break;
				}
			}
		}
	}

	// Groups: "including X", "the whole department"
	const groupPatterns = [
		/(?:including|expecting|investors?|about\s+\d+\s+(?:people|attendees?|volunteers?|members?|parents?|chaperones?)|the\s+whole\s+[a-z]+)\s+([^,.]+)/gi
	];

	for (const pattern of groupPatterns) {
		const match = nonUrlText.match(pattern);
		if (match && match[1] && match[1].length > 2 && match[1].length < 60) {
			result.attendants = [match[1].trim()];
			confidence += 0.1;
			break;
		}
	}

	// Compromise people() last, only when nothing matched — and on text with
	// the detected location and any URLs removed so links/places aren't read
	// as people.
	if (!result.attendants || result.attendants.length === 0) {
		let attendantText = nonUrlText;
		if (result.location) {
			attendantText = input.replace(
				new RegExp(result.location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
				''
			);
		}
		const people = nlp(attendantText).people().out('array');
		if (people.length > 0) {
			// Filter out short tokens (<=2 chars) which are likely locations/abbreviations, not people
			const filteredPeople = people.filter((p: string) => p.length > 2);
			if (filteredPeople.length > 0) {
				result.attendants = filteredPeople;
				confidence += 0.15;
			}
		}
	}

	// ===== TITLE =====
	// Always take first 50 chars of input as title (simplified). URLs were
	// already removed from titleSource so links ride whole in the
	// description and can never be cut in half here.
	let titleSource = nonUrlText;
	// Recurrence phrases describe the schedule, not the event name.
	for (const phrase of recurrencePhrases) {
		const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		titleSource = titleSource.replace(new RegExp(escaped, 'i'), ' ');
	}
	titleSource = titleSource.replace(/\s{2,}/g, ' ').trimStart();
	let title = titleSource.substring(0, 50);
	// Never end the title mid-word: when the 50-char cut lands inside a
	// word ("with nathan an"), snap back to the last space.
	if (titleSource.length > 50 && /\S/.test(titleSource[50] ?? '') && !/\s$/.test(title)) {
		const cut = title.lastIndexOf(' ');
		if (cut > 3) title = title.slice(0, cut);
	}
	// A connector left dangling by the snap ("…jennifer and") goes too — but
	// only when nothing follows it, so the pinned "dinner for " cut survives.
	title = title.replace(/\s+(?:and|or|on|at|to|for|from|&|am|pm)$/i, '');
	// Remove trailing punctuation (but preserve spaces to match first 50 chars behavior)
	title = title.replace(/[.,;:!?]+$/, '');

	if (title.length > 3 && !title.match(/^[\s,]*$/)) {
		result.title = title;
		confidence += 0.2;
	}

	// Title refinement: title = unmatched text + attendants. Compare on the
	// 50-char window itself: spans stripped beyond it must not reformat the
	// pinned first-50 title (existing tests pin trailing-space behavior).
	{
		const window = result.title ?? '';
		const strippedWindow = stripTitleSpans(window, [
			...recurrencePhrases,
			...stripSpans,
			...titleOnlySpans
		]);
		const cleaned = cleanTitleText(strippedWindow);
		// Clean when spans were stripped here, or when the window opens with a
		// connector the pre-window strip stranded ("friday and saturday dinner"
		// → "and dinner"). Windows that merely END in a stop word ("…for ")
		// are pinned cuts — never touched.
		if (
			(strippedWindow !== window ||
				/^[^a-z0-9]*\b(on|from|for|at|to|and|or|&|am|pm)\b/i.test(window)) &&
			window
		) {
			const final = cleaned.replace(/[.,;:!?]+$/, '');
			if (final.length > 3 && !/^[\s,]*$/.test(final)) {
				result.title = final;
			} else {
				const fallback = nonUrlText.substring(0, 50).replace(/[.,;:!?]+$/, '');
				if (fallback.length > 0) result.title = fallback;
			}
		}
	}

	// ===== LOCATION FROM @ SYMBOL =====
	// Handle "Event Title @ Location" pattern (URL-free text: an @ inside a
	// link is not a location separator)
	if (nonUrlText.includes('@')) {
		const afterAt = nonUrlText.substring(nonUrlText.indexOf('@') + 1).trim();

		if (afterAt.length > 0 && !result.location) {
			// Stop at date patterns, time patterns, "View & RSVP", etc.
			const stopRegex =
				/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}|thursday|friday|saturday|sunday|monday|tuesday|wednesday|\d{1,2}:\d{2}\s*(?:am|pm)|\b(?:view\s*&\s*rsvp|event\s*details)\b/gi;

			let locationPart = afterAt;
			const stopMatch = locationPart.search(stopRegex);
			if (stopMatch > 0) {
				locationPart = locationPart.substring(0, stopMatch);
			}

			const cleanedLocation = locationPart.replace(/\s+/g, ' ').trim();

			if (cleanedLocation.length > 0 && cleanedLocation.length < 100) {
				result.location = cleanedLocation;
				confidence += 0.15;
			}
		}
	}

	// ===== DEFAULTS =====
	// Links live whole in the description; the title never carries one.
	if (urls.length > 0 && !result.description) {
		result.description = urls.join(' ');
	}

	if (!result.date) {
		result.date = now.toFormat('yyyy-MM-dd');
	}

	if (result.allDay && !result.startTime) {
		result.startTime = '09:00';
		result.endTime = '17:00';
	}

	return { parsed: result, confidence: Math.min(confidence, 1) };
}

/** A segment carries its own when/where when it names a date, time, or
 * recurrence — both sides need one or "fish and chips Friday" would split. */
const SEGMENT_SIGNAL =
	/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|today|yesterday|weekend|daily|weekly|monthly|yearly|every|january|february|march|april|may|june|july|august|september|october|november|december|\d)\b/i;

/**
 * Stricter signal for comma splits: bare digits don't count, so year
 * fragments ("Sept 5, 2026 party") and counts ("Buy milk, eggs") never
 * split. Weekdays, months, times, and recurrence words do.
 */
const COMMA_SIGNAL =
	/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|today|yesterday|weekend|daily|weekly|monthly|yearly|every|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(?:am|pm)\b/i;

/** Minimum confidence for a segment to count as its own event. */
const MIN_SEGMENT_CONFIDENCE = 0.3;

/** Attendee-list spans ("with james and joseph"): an "and"/comma inside one
 * never splits events — the list belongs to a single event (issue 030). */
const WITH_LIST_PATTERN =
	"\\bwith\\s+[A-Za-z][A-Za-z'’-]*(?:(?:\\s+and\\s+|\\s*&\\s*|\\s*,\\s*)[A-Za-z][A-Za-z'’-]*)*";

function withListSpans(text: string): Array<[number, number]> {
	const spans: Array<[number, number]> = [];
	for (const m of text.matchAll(new RegExp(WITH_LIST_PATTERN, 'gi'))) {
		const start = m.index ?? 0;
		spans.push([start, start + m[0].length]);
	}
	return spans;
}

/** Date-atom edge tests for chain vetoes: a separator with a date atom hard
 * against it on BOTH sides joins a date list ("today and tomorrow", "sept 23
 * and 30", "friday and the 5th") — one multi-date parse, not two events.
 * Bare trailing digits count only on the right edge (day continuations). */
const WEEKDAY_ATOM =
	'\\b(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nes|nesday)?|thu(?:r?s?(?:day)?)?|fri(?:day)?|sat(?:ur|urday)?)\\b';
const REL_ATOM = '\\b(?:today|tomorrow|yesterday)\\b';
const DATE_END_RE = new RegExp(
	`(?:${REL_ATOM}|${WEEKDAY_ATOM}|\\b(?:${MONTH_ALT})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_ALT})|\\b\\d{1,2}(?:st|nd|rd|th)\\s+of\\s+(?:${MONTH_ALT})|\\b20\\d{2}-\\d{2}-\\d{2})\\s*$`,
	'i'
);
const DATE_START_RE = new RegExp(
	`^\\s*(?:the\\s+)?(?:${REL_ATOM}|${WEEKDAY_ATOM}|\\b(?:${MONTH_ALT})\\.?\\s+\\d{1,2}|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_ALT})|\\b\\d{1,2}(?:st|nd|rd|th)\\s+of\\s+(?:${MONTH_ALT})|\\b\\d{1,2}\\b(?!\\s*:)|\\b20\\d{2}-\\d{2}-\\d{2})`,
	'i'
);

/** Split positions that survive the vetoes (chain joins, attendee lists). */
function survivingCuts(
	input: string,
	seps: RegExpMatchArray[],
	sepLen: (m: RegExpMatchArray) => number
): number[] {
	const spans = withListSpans(input);
	const cuts: number[] = [];
	for (const m of seps) {
		const i = m.index ?? 0;
		const left = input.slice(0, i);
		const right = input.slice(i + sepLen(m));
		const chainJoin = DATE_END_RE.test(left) && DATE_START_RE.test(right);
		const inWithList = spans.some(([s, e]) => i >= s && i < e);
		if (!chainJoin && !inWithList) cuts.push(i);
	}
	return cuts;
}

/** Split input at the given separator positions (absolute indices). */
function splitAt(input: string, cuts: number[], cutLen: number): string[] {
	const parts: string[] = [];
	let prev = 0;
	for (const c of cuts) {
		parts.push(input.slice(prev, c));
		prev = c + cutLen;
	}
	parts.push(input.slice(prev));
	return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Multi-event segmentation (item 5). Splits on semicolons/newlines and on
 * "and" only when both sides carry date/time signals, parses each segment
 * independently, and falls back to a single result when fewer than two
 * segments clear the confidence gate — never degrading the common case.
 */
export function parseEventList(input: string, zone?: string): ParseResult[] {
	const hardSplit = input
		.split(/[;\n]+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	const candidates =
		hardSplit.length > 1
			? hardSplit
			: splitOnComma(input).length > 1
				? splitOnComma(input)
				: splitOnAnd(input);
	if (candidates.length < 2) return [parseEventInput(input, zone)];
	const parsed = candidates.map((c) => parseEventInput(c, zone));
	if (parsed.filter((p) => p.confidence >= MIN_SEGMENT_CONFIDENCE).length < 2) {
		return [parseEventInput(input, zone)];
	}
	return parsed;
}

/** Split on commas only when every part carries its own signal. Chain joins
 * ("today, tomorrow") and attendee lists ("with mary, sue") never split. */
function splitOnComma(input: string): string[] {
	const commas = [...input.matchAll(/,/g)];
	if (commas.length === 0) return [input];
	const cuts = survivingCuts(input, commas, () => 1);
	if (cuts.length === 0) return [input];
	const parts = splitAt(input, cuts, 1);
	if (parts.length < 2) return [input];
	if (!parts.every((p) => COMMA_SIGNAL.test(p))) return [input];
	return parts;
}

/** Split on "and" between two signal-bearing halves, else no split.
 * Vetoes (per "and"): day-coordinated pairs ("on Tuesday and Thursday" —
 * one series, typos included), date-chain joins ("today and tomorrow" —
 * one multi-date parse), and attendee lists ("with james and joseph").
 * Commas don't veto ("Friday, movie Saturday" still splits). */
function splitOnAnd(input: string): string[] {
	const ands = [...input.matchAll(/\band\b/gi)];
	if (ands.length === 0) return [input];
	const tokens = extractDayTokens(input);
	for (let i = 0; i + 1 < tokens.length; i++) {
		const between = input.slice(tokens[i].index + tokens[i].raw.length, tokens[i + 1].index);
		if (/^\s*(and|&)\s*$/i.test(between)) return [input];
	}
	const cuts = survivingCuts(input, ands, () => 3);
	if (cuts.length === 0) return [input];
	const parts = splitAt(input, cuts, 3);
	if (!parts.every((p) => SEGMENT_SIGNAL.test(p))) return [input];
	return parts;
}

// ===== Bill quick-add NLP (issue 011) =====

export type BillRecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Parsed quick-add bill phrase: everything the bills page needs in one pass. */
export interface ParsedBill {
	/** Unmatched remainder; null when only schedule tokens remain. */
	title: string | null;
	/** Dollar amount as written (85, 15.99). */
	amount: number | null;
	/** Integer cents (8500, 1599) — null when no amount phrase was found. */
	amountCents: number | null;
	/** Resolved due date YYYY-MM-DD in the caller zone; null without a due cue. */
	dueDate: string | null;
	/** Event-parser recurrence value: daily|weekly|biweekly|monthly|yearly|every_N_unit. */
	recurring?: string;
	/** Structured schedule for the bills recurrence columns (#006). */
	frequency: BillRecurrenceFrequency | null;
	interval: number | null;
	/** Closed-vocabulary category hint (#tag wins, then merchant keywords). */
	category: BillCategory;
	confidence: number;
}

/** Closed-vocabulary set for the #tag check. */
const BILL_CATEGORY_SET: ReadonlySet<string> = new Set(BILL_CATEGORIES);

/** Merchant word → category matcher: the SHARED table in
 * `$lib/data/categories` (arch audit #4 — was a diverging local copy).
 * Tax/fees sit first (#031): an explicit tax/fee word is its own category,
 * never absorbed into the merchant's. */

/** Day-token alternation (abbreviations included) for due-cue matching. */
const BILL_DAY_ALT =
	'sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nes|nesday)?|thu(?:r?s?(?:day)?)?|fri(?:day)?|sat(?:ur|urday)?';

/** Next strictly-future date on one of the weekday codes, optionally a
 * further whole week out ("next friday"). */
function nextWeekdayFrom(now: DateTime, codes: string[], extraWeeks = 0): string {
	const current = now.weekday; // 1=Mon..7=Sun
	let best = 8;
	for (const d of codes) {
		const target = WEEK_ORDER.indexOf(d) + 1;
		let delta = target - current;
		if (delta <= 0) delta += 7;
		best = Math.min(best, delta);
	}
	return now.plus({ days: best + extraWeeks * 7 }).toFormat('yyyy-MM-dd');
}

/** Day-of-month with monthly rollover when it already passed; clamped to
 * short months ("the 31st" in April lands on the 30th). */
function nextMonthDayFrom(now: DateTime, day: number): string {
	const clamp = (base: DateTime) => base.set({ day: Math.min(day, base.daysInMonth ?? 28) });
	let target = clamp(now);
	if (target < now.startOf('day')) target = clamp(now.plus({ months: 1 }));
	return target.toFormat('yyyy-MM-dd');
}

/** Relative cue unit → ISO date N units from now. */
function relativeFrom(now: DateTime, n: number, unit: string): string {
	const count = n === 0 ? 1 : n;
	const singular = unit.replace(/s$/, '');
	const dt =
		singular === 'week'
			? now.plus({ weeks: count })
			: singular === 'month'
				? now.plus({ months: count })
				: now.plus({ days: count });
	return dt.toFormat('yyyy-MM-dd');
}

interface BillDueStep {
	re: RegExp;
	resolve: (m: RegExpMatchArray, now: DateTime) => string | null;
}

/** Due-date cues, priority order. Cues (due/by/starting/starts) gate the
 * weak forms so titles keep their words; month-day needs no cue (a month
 * name next to a number is a strong date signal). */
const BILL_DUE_STEPS: BillDueStep[] = [
	{
		re: new RegExp(
			`\\b(?:due|by|starting|starts|on)\\s+(?:on\\s+|by\\s+)?(this\\s+|next\\s+)?(${BILL_DAY_ALT})\\b`,
			'i'
		),
		resolve: (m, now) => {
			const code = normalizeDayToken(m[2]);
			if (!code) return null;
			return nextWeekdayFrom(now, [code], m[1]?.toLowerCase() === 'next' ? 1 : 0);
		}
	},
	{
		re: /\b(?:due|starting|starts)\s+(tomorrow|today)\b/i,
		resolve: (m, now) =>
			now.plus({ days: m[1].toLowerCase() === 'tomorrow' ? 1 : 0 }).toFormat('yyyy-MM-dd')
	},
	{
		re: /\b(?:due|starting|starts)\s+(?:in\s+)?(a|\d+)\s+(days?|weeks?|months?)\b/i,
		resolve: (m, now) =>
			relativeFrom(now, m[1].toLowerCase() === 'a' ? 1 : parseInt(m[1]), m[2].toLowerCase())
	},
	{
		re: /\b(?:due\s+)?(?:on\s+|by\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i,
		resolve: (m, now) => {
			const day = parseInt(m[1]);
			return day >= 1 && day <= 31 ? nextMonthDayFrom(now, day) : null;
		}
	},
	{
		re: new RegExp(
			`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`,
			'i'
		),
		resolve: (m, now) => {
			const month = MONTH_MAP[m[1].toLowerCase()];
			if (!month) return null;
			return withRolloverYear(month, parseInt(m[2]), m[3] ? parseInt(m[3]) : null, now).toFormat(
				'yyyy-MM-dd'
			);
		}
	},
	{
		re: new RegExp(
			`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?(?:,?\\s*(20\\d{2}))?\\b`,
			'i'
		),
		resolve: (m, now) => {
			const month = MONTH_MAP[m[2].toLowerCase()];
			const day = parseInt(m[1]);
			if (!month || day < 1 || day > 31) return null;
			return withRolloverYear(month, day, m[3] ? parseInt(m[3]) : null, now).toFormat('yyyy-MM-dd');
		}
	},
	{
		re: /\b(?:due|starting|starts)\s+(\d{1,2})\/(\d{1,2})\b/,
		resolve: (m, now) => {
			const month = parseInt(m[1]);
			const day = parseInt(m[2]);
			if (month < 1 || month > 12 || day < 1 || day > 31) return null;
			return withRolloverYear(month, day, null, now).toFormat('yyyy-MM-dd');
		}
	},
	{
		re: /\b(?:due|starting|starts)\s+next\s+(week|month)\b/i,
		resolve: (m, now) =>
			m[1].toLowerCase() === 'month'
				? now.plus({ months: 1 }).set({ day: 1 }).toFormat('yyyy-MM-dd')
				: now.plus({ weeks: 1 }).toFormat('yyyy-MM-dd')
	}
];

interface BillRecurrenceStep {
	re: RegExp;
	value: (m: RegExpMatchArray) => string;
}

/** Recurrence cues, mapped into the SAME value vocabulary the event parser
 * emits ("monthly", "biweekly", "every_6_months") so #006 can store
 * frequency + interval without a second grammar. */
const BILL_RECURRENCE_STEPS: BillRecurrenceStep[] = [
	{
		re: /\bevery\s+other\s+(day|week|month)\b/i,
		value: (m) => (m[1].toLowerCase() === 'week' ? 'biweekly' : `every_2_${m[1].toLowerCase()}`)
	},
	{
		re: /\bevery\s+(\d+)\s+(days?|weeks?|months?|years?)\b/i,
		value: (m) => `every_${m[1]}_${m[2].toLowerCase()}`
	},
	{
		re: /\b(?:quarterly|every\s+quarter|per\s+quarter|\/\s*quarter)\b/i,
		value: () => 'every_3_months'
	},
	{
		re: /\b(?:biannually|semi-?annually|twice\s+a\s+year)\b/i,
		value: () => 'every_6_months'
	},
	{
		re: new RegExp(`\\bevery\\s+(${BILL_DAY_ALT})\\b`, 'i'),
		value: () => 'weekly'
	},
	{ re: /\bevery\s+months?\b/i, value: () => 'monthly' },
	{ re: /\b(?:daily|every\s+day)\b/i, value: () => 'daily' },
	{ re: /\bweekly\b/i, value: () => 'weekly' },
	{ re: /\bmonthly\b/i, value: () => 'monthly' },
	{ re: /\b(?:yearly|annually)\b/i, value: () => 'yearly' },
	{ re: /\b(?:\/\s*|per\s+|a\s+|each\s+)(?:months?|mos?)\b/i, value: () => 'monthly' },
	{ re: /\b(?:\/\s*|per\s+|a\s+|each\s+)(?:weeks?|wks?)\b/i, value: () => 'weekly' },
	{ re: /\b(?:\/\s*|per\s+|a\s+|each\s+)(?:years?|yrs?)\b/i, value: () => 'yearly' }
];

/** Structured schedule derived from a recurrence value (bills #006). */
interface BillSchedule {
	frequency: BillRecurrenceFrequency | null;
	interval: number | null;
}

/** Schedule pairs for the plain value words (interval 2 = every other). */
const BASE_SCHEDULES = {
	daily: ['daily', 1],
	weekly: ['weekly', 1],
	biweekly: ['weekly', 2],
	monthly: ['monthly', 1],
	yearly: ['yearly', 1]
} as const;

/** Event-parser recurrence value → DB frequency + interval (bills #006). */
function recurrenceToSchedule(recurring: string | undefined): BillSchedule {
	if (!recurring) return { frequency: null, interval: null };
	const intervalMatch = recurring.match(/^every_(\d+)_(days?|weeks?|months?|years?)$/);
	if (intervalMatch) {
		const unit = intervalMatch[2].replace(/s$/, '');
		// SAFETY: the regex above whitelists exactly these four unit words.
		const freq = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }[
			unit as 'day' | 'week' | 'month' | 'year'
		] as BillRecurrenceFrequency;
		return { frequency: freq, interval: Math.max(1, parseInt(intervalMatch[1])) };
	}
	const base = lookup(BASE_SCHEDULES, recurring);
	if (!base) return { frequency: null, interval: null };
	return { frequency: base[0], interval: base[1] };
}

/** "1,234.56" → integer cents, guarded to the Postgres int4 ceiling. */
function dollarsToCents(raw: string): number | null {
	const dollars = Number.parseFloat(raw.replace(/,/g, ''));
	if (!Number.isFinite(dollars) || dollars < 0) return null;
	const cents = Math.round(dollars * 100);
	if (!Number.isSafeInteger(cents) || cents > 2147483647) return null;
	return cents;
}

/** Dollar-amount forms, priority order: $-prefixed (commas optional),
 * worded currency ("85 dollars"), then a bare leftover number. */
const BILL_AMOUNT_STEPS: RegExp[] = [
	/\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/,
	/\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:dollars?|usd|bucks)\b/i,
	/\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\b(?!\s*(?:st|nd|rd|th|:|am|pm))/i
];

/** Edge-only title stop words: schedule connectors and weekday names left
 * behind by span stripping. Mid-title words are never touched. */
const BILL_TITLE_STOP = new Set([
	'due',
	'on',
	'by',
	'the',
	'in',
	'at',
	'for',
	'of',
	'a',
	'an',
	'per',
	'and',
	'or',
	'to',
	'from',
	'every',
	'starting',
	'starts',
	'with',
	...FULL_WEEKDAYS
]);

/**
 * Parses a quick-add bill phrase ("electric bill $85 due friday") into a
 * bill intent. Sequential stripping, event-parser style: due cues first,
 * then recurrence, then the amount, so weak forms (bare numbers) can never
 * eat a date or schedule span. Category: #tag wins, then merchant keywords.
 * Amounts leave as integer cents — the boundary the DB stores (never float).
 */
export function parseBillQuickAdd(input: string, zone?: string): ParsedBill {
	const now = zone ? DateTime.now().setZone(zone) : DateTime.now();
	let text = input;
	let confidence = 0;

	// Category: explicit #tag wins; merchant keywords scan the ORIGINAL
	// input so earlier strips can't hide the merchant word.
	let category: BillCategory | null = null;
	const tagMatch = text.match(/#([A-Za-z][\w-]*)/);
	if (tagMatch) {
		const tag = tagMatch[1].toLowerCase();
		if (BILL_CATEGORY_SET.has(tag)) {
			// SAFETY: the Set.has check above pinned tag to a BILL_CATEGORIES
			// literal, which is exactly the closed BillCategory vocabulary.
			category = tag as BillCategory;
		}
		text = text.replace(tagMatch[0], ' ');
	}
	if (!category) {
		category = categoryForKeyword(input);
	}
	if (category) confidence += 0.1;

	// Due date: first resolving cue wins; its span is stripped from the text.
	let dueDate: string | null = null;
	for (const step of BILL_DUE_STEPS) {
		const m = text.match(step.re);
		if (!m) continue;
		const resolved = step.resolve(m, now);
		if (resolved) {
			dueDate = resolved;
			text = text.replace(m[0], ' ');
			confidence += 0.25;
			break;
		}
	}

	// Recurrence: same value vocabulary as the event parser. "every <day>"
	// also anchors the due date on the next occurrence.
	let recurring: string | undefined;
	for (const step of BILL_RECURRENCE_STEPS) {
		const m = text.match(step.re);
		if (!m) continue;
		recurring = step.value(m);
		text = text.replace(m[0], ' ');
		confidence += 0.2;
		if (!dueDate && step.re.source.includes('every')) {
			const dayMatch = m[0].match(new RegExp(`(${BILL_DAY_ALT})`, 'i'));
			const code = dayMatch ? normalizeDayToken(dayMatch[1]) : null;
			if (code) dueDate = nextWeekdayFrom(now, [code]);
		}
		break;
	}

	// Amount: $-prefixed, then worded currency, then a bare leftover number.
	// The bare form skips 4-digit years so "lease renewal 2027" stays
	// amountless. Cents are derived from the matched span — never float math
	// on a rounded dollar value.
	let amountRaw: string | null = null;
	for (let i = 0; i < BILL_AMOUNT_STEPS.length; i++) {
		const m = text.match(BILL_AMOUNT_STEPS[i]);
		if (!m) continue;
		if (i === BILL_AMOUNT_STEPS.length - 1 && /^(19|20)\d{2}$/.test(m[1])) break;
		amountRaw = m[1];
		text = text.replace(m[0], ' ');
		break;
	}
	const amountCents = amountRaw === null ? null : dollarsToCents(amountRaw);
	const amount = amountCents === null ? null : amountCents / 100;
	if (amountCents !== null) confidence += 0.4;
	if (dueDate) confidence += 0.25;

	const { frequency, interval } = recurrenceToSchedule(recurring);

	// Title: whatever schedule/amount/tag stripping left behind, edge stop
	// words trimmed.
	const tokens = text.split(/\s+/).filter(Boolean);
	while (
		tokens.length > 0 &&
		BILL_TITLE_STOP.has(tokens[0].toLowerCase().replace(/[^a-z]/gi, ''))
	) {
		tokens.shift();
	}
	while (
		tokens.length > 0 &&
		BILL_TITLE_STOP.has(tokens[tokens.length - 1].toLowerCase().replace(/[^a-z]/gi, ''))
	) {
		tokens.pop();
	}
	const title = tokens.join(' ').replace(/[.,;:!?]+$/, '') || null;
	if (title) confidence += 0.1;

	return {
		title,
		amount,
		amountCents,
		dueDate,
		recurring,
		frequency,
		interval,
		category: category ?? 'other',
		confidence: Math.min(confidence, 1)
	};
}
