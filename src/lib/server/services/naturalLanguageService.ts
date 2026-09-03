import { DateTime } from 'luxon';
import nlp from 'compromise';
import {
	applyPeriod,
	DAY_MAP,
	MONTH_ALT,
	MONTH_MAP,
	normalizeTime
} from '$lib/server/utils/dateParsing';

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

const ORDINAL_WORD_MAP: Record<string, number> = {
	first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
	eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19,
	twentieth: 20, 'twenty-first': 21, 'twenty first': 21, 'twenty-second': 22, 'twenty second': 22, 'twenty-third': 23, 'twenty third': 23,
	twentyfourth: 24, 'twenty-fourth': 24, 'twenty fourth': 24, 'twenty-fifth': 25, 'twenty fifth': 25, 'twenty-sixth': 26, 'twenty sixth': 26,
	'twenty-seventh': 27, 'twenty seventh': 27, 'twenty-eighth': 28, 'twenty eighth': 28, 'twenty-ninth': 29, 'twenty ninth': 29,
	thirtieth: 30, 'thirty-first': 31, 'thirty first': 31
};

const ORDINAL_WORDS_PATTERN = '(?:twenty-(?:first|second|third|fifth|sixth|seventh|eighth|ninth)|thirty-first|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twentyfourth|twentyfifth|twentysixth|twentyseventh|twentyeighth|twentyninth|thirtieth|thirtyfirst)';

function parseDayOfWeek(day: string): number | null {
	return DAY_MAP[day.toLowerCase()] ?? null;
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
function withRolloverYear(month: number, day: number, explicitYear: number | null, now: DateTime): DateTime {
	let year = explicitYear ?? now.year;
	if (!explicitYear && DateTime.fromObject({ year, month, day }) < now && month <= now.month) {
		year += 1;
	}
	return DateTime.fromObject({ year, month, day });
}

/** Weekday abbreviation/full name → RRULE code. Null when unrecognized. */
function normalizeDayToken(t: string): string | null {
	const s = t.toLowerCase();
	if (/^mon/.test(s)) return 'MO';
	if (/^tue/.test(s)) return 'TU';
	if (/^wed/.test(s)) return 'WE';
	if (/^thu/.test(s)) return 'TH';
	if (/^fri/.test(s)) return 'FR';
	if (/^sat/.test(s)) return 'SA';
	if (/^sun/.test(s)) return 'SU';
	return null;
}

const WEEK_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

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
function resolveUntilDate(m: RegExpMatchArray, now: DateTime, zone?: string): string | null {	let dt: DateTime | null = null;
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
const TITLE_STOP = new Set(['on', 'from', 'at', 'to', 'and', 'or', '&', 'am', 'pm']);

/** Cosmetic digit-times the parser consumed ("5:30", "9am", "a5pm"). */
const TITLE_TIME_RES = [/\b\d{1,2}:\d{2}\s*(?:am|pm)?\s*[-–—]\s*\d{1,2}:\d{2}\s*(?:am|pm)?/gi, /\b\d{1,2}:\d{2}\b/g, /\ba\s*\d{1,2}(?::?\d{2})?\s*(?:am|pm)\b/gi, /\b\d{1,2}\s*(?:am|pm)\b/gi];

/** Strip consumed schedule spans plus cosmetic digit-times. */
function stripTitleSpans(title: string, phrases: string[]): string {
	let text = title;
	for (const phrase of phrases) {
		const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		text = text.replace(new RegExp(escaped, 'i'), ' ');
	}
	for (const re of TITLE_TIME_RES) text = text.replace(re, ' ');
	return text;
}

/**
 * Drop leftover connectors ("launch on , from" -> "launch"). Runs until
 * stable (max 3 passes) so drops that create new edges settle.
 */
function cleanTitleText(title: string): string {
	let text = title;
	for (let pass = 0; pass < 3; pass++) {
		const collapsed = text.replace(/\s{2,}/g, ' ').replace(/\s+([,;:!?])/g, '$1').trimStart();
		const tokens = collapsed.split(' ').filter((t) => t.length > 0);
		const kept = tokens.filter((t, i) => {
			const core = t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '').toLowerCase();
			if (core === '') return false;
			if (!TITLE_STOP.has(core)) return true;
			const prev = tokens[i - 1] ?? '';
			const next = tokens[i + 1] ?? '';
			const isPunct = (s: string) => s.length > 0 && /^[^a-z0-9]+$/i.test(s);
			return !(i === 0 || i === tokens.length - 1 || t !== core || isPunct(prev) || isPunct(next));
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
	const getDoc = () => (doc ??= nlp(input));
	const lower = input.toLowerCase();

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
	const dateInput = untilMatch ? input.replace(untilMatch[0], ' ') : input;

	// Exact schedule spans consumed by the parser (explicit dates, relative
	// days, reminders, calendar targets). The title step strips these so the
	// title = unmatched text + attendants.
	const stripSpans: string[] = [];

	// ===== DATE PATTERNS =====
	
	// "this Friday", "this Saturday"
	const thisDayMatch = dateInput.match(/\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
	if (thisDayMatch) {
		result.date = getNextDayOfWeek(thisDayMatch[1], zone).toFormat('yyyy-MM-dd');
		stripSpans.push(thisDayMatch[0]);
		confidence += 0.25;
	}

	// "next Wednesday", "next Tuesday"
	const nextDayMatch = dateInput.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
	if (nextDayMatch && !result.date) {
		result.date = getNextDayOfWeek(nextDayMatch[1], zone).plus({ weeks: 1 }).toFormat('yyyy-MM-dd');
		stripSpans.push(nextDayMatch[0]);
		confidence += 0.25;
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
		result.date = now.plus({ [`${relativeMatch[2].toLowerCase()}s`]: n } as any).toFormat('yyyy-MM-dd');
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
	const returnDayMatch = dateInput.match(/returning\s+(?:by\s+)?(?:this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+(morning|afternoon|evening|noon))?/i);
	if (returnDayMatch && !result.date) {
		result.date = getNextDayOfWeek(returnDayMatch[1], zone).toFormat('yyyy-MM-dd');
		stripSpans.push(returnDayMatch[0]);
		if (returnDayMatch[2]) {
			const timeMap: Record<string, string> = { morning: '09:00', afternoon: '14:00', evening: '18:00', noon: '12:00' };
			result.endTime = timeMap[returnDayMatch[2].toLowerCase()] || '18:00';
		}
		confidence += 0.2;
	}

	// Month and day: "July 12th", "Aug 30", "Sept 5", "Dec 25, 2026"
	const monthDayMatch = dateInput.match(new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`, 'i'));
	if (monthDayMatch && !result.date) {
		const month = MONTH_MAP[monthDayMatch[1].toLowerCase()];
		const day = parseInt(monthDayMatch[2]);
		const target = withRolloverYear(month, day, monthDayMatch[3] ? parseInt(monthDayMatch[3]) : null, now);
		result.date = target.toFormat('yyyy-MM-dd');
		confidence += 0.3;
	}

	// Day-first with optional year: "21 Mar 2027", "12 August"
	const dayFirstMatch = dateInput.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?(?:,?\\s*(20\\d{2}))?\\b`, 'i'));
	if (dayFirstMatch && !result.date) {
		const day = parseInt(dayFirstMatch[1]);
		const month = MONTH_MAP[dayFirstMatch[2].toLowerCase()];
		if (day >= 1 && day <= 31) {
			const target = withRolloverYear(month, day, dayFirstMatch[3] ? parseInt(dayFirstMatch[3]) : null, now);
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

	// Ordinal-first: "3rd of May", "third of June", "twenty-first of December"
	const ordinalFirstMatch = dateInput.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)\\s+of\\s+(january|february|march|april|may|june|july|august|september|october|november|december)\\b`, 'i'));
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
	const ordinalWordMatch = dateInput.match(new RegExp(`\\b(${ORDINAL_WORDS_PATTERN})\\s+of\\s+(january|february|march|april|may|june|july|august|september|october|november|december)\\b`, 'i'));
	if (ordinalWordMatch && !result.date) {
		const month = MONTH_MAP[ordinalWordMatch[2].toLowerCase()];
		const rawWord = ordinalWordMatch[1].toLowerCase();
		const normalized = rawWord.replace(/\s+/g, ' ').trim();
		const day = ORDINAL_WORD_MAP[normalized];
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
		const which = ordinalDayMatch[1].toLowerCase() as
			| 'first' | 'second' | 'third' | 'fourth' | 'fifth' | 'last';
		const jsDay = DAY_MAP[ordinalDayMatch[2].toLowerCase()];
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
	const monthDaySweep = new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`, 'gi');
	while ((sweep = monthDaySweep.exec(dateInput)) !== null) {
		const month = MONTH_MAP[sweep[1].toLowerCase()];
		if (month) {
			const dt = withRolloverYear(month, parseInt(sweep[2]), sweep[3] ? parseInt(sweep[3]) : null, now);
			if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
		}
	}
	const dayFirstSweep = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?(?:,?\\s*(20\\d{2}))?\\b`, 'gi');
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
	const ordinalSweep = /\b(\d{1,2})(?:st|nd|rd|th)\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;
	while ((sweep = ordinalSweep.exec(dateInput)) !== null) {
		const month = MONTH_MAP[sweep[2].toLowerCase()];
		const day = parseInt(sweep[1]);
		if (month && day >= 1 && day <= 31) {
			const dt = withRolloverYear(month, day, null, now);
			if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
		}
	}
	const ordinalDaySweep = /\b(first|second|third|fourth|fifth|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+of\s+(the\s+month|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;
	while ((sweep = ordinalDaySweep.exec(dateInput)) !== null) {
		const which = sweep[1].toLowerCase() as 'first' | 'second' | 'third' | 'fourth' | 'fifth' | 'last';
		const jsDay = DAY_MAP[sweep[2].toLowerCase()];
		const luxonDay = jsDay === 0 ? 7 : jsDay;
		const monthToken = sweep[3].toLowerCase();
		const month = monthToken === 'the month' ? now.month : MONTH_MAP[monthToken];
		let target = ordinalWeekdayOfMonth(now.year, month, luxonDay, which);
		if (target && target < now.startOf('day')) {
			target = monthToken === 'the month'
				? ordinalWeekdayOfMonth(now.plus({ months: 1 }).year, now.plus({ months: 1 }).month, luxonDay, which)
				: ordinalWeekdayOfMonth(now.year + 1, month, luxonDay, which);
		}
		if (target) pushExplicit(sweep.index, target.toFormat('yyyy-MM-dd'), sweep[0]);
	}
	// Continuations ("& 30", ", 12", "and 19") borrow month/year from the
	// nearest preceding explicit date.
	const contSweep = /(?:&|,|\band\b)\s*(\d{1,2})(?:st|nd|rd|th)?\b/gi;
	while ((sweep = contSweep.exec(dateInput)) !== null) {
		const day = parseInt(sweep[1]);
		const prior = explicitDates.filter((e) => e.index < sweep!.index).pop();
		if (!prior) continue;
		const base = DateTime.fromISO(prior.date);
		const dt = DateTime.fromObject({ year: base.year, month: base.month, day });
		if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
	}
	explicitDates.sort((a, b) => a.index - b.index);
	if (explicitDates.length >= 2) {
		result.dates = explicitDates.map((e) => e.date);
	}
	for (const e of explicitDates) stripSpans.push(e.span);

	// Bare-weekday fallback ("dinner friday"): no date matched anywhere, so
	// the first named weekday is the event day (next occurrence).
	if (!result.date) {
		const bareDay = dateInput.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
		if (bareDay) {
			result.date = getNextDayOfWeek(bareDay[1], zone).toFormat('yyyy-MM-dd');
			confidence += 0.2;
			stripSpans.push(bareDay[0]);
		}
	}

	// ===== TIME PATTERNS =====
	let foundTime = false;

	// "6:00PM - 8:00PM" (time range with hyphen) — must check BEFORE standalone time.
	// A missing start meridiem inherits the end one ("5:30-6:30pm" is evening),
	// mirroring the from/to and between rules below.
	const hyphenRangeMatch = input.match(/(\d{1,2}):(\d{2})\s*(am?|pm?)?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(am?|pm?)/i);
	if (hyphenRangeMatch) {
		let startHour = parseInt(hyphenRangeMatch[1]);
		let startMin = parseInt(hyphenRangeMatch[2]);
		let endHour = parseInt(hyphenRangeMatch[4]);
		let endMin = parseInt(hyphenRangeMatch[5]);
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
	const shortRangeMatch = input.match(/\bfrom\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
	if (shortRangeMatch && !foundTime) {
		const startPeriod = shortRangeMatch[3]?.toLowerCase();
		const endPeriod = shortRangeMatch[6]?.toLowerCase();
		const effectiveStartPeriod = startPeriod || endPeriod;
		result.startTime = normalizeTime(applyPeriod(parseInt(shortRangeMatch[1]), effectiveStartPeriod), shortRangeMatch[2] ? parseInt(shortRangeMatch[2]) : 0);
		result.endTime = normalizeTime(applyPeriod(parseInt(shortRangeMatch[4]), endPeriod), shortRangeMatch[5] ? parseInt(shortRangeMatch[5]) : 0);
		foundTime = true;
		confidence += 0.25;
	}

	// "between 2 and 4 PM"
	const betweenRangeMatch = input.match(/\bbetween\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+and\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
	if (betweenRangeMatch && !foundTime) {
		const endPeriod = betweenRangeMatch[6]?.toLowerCase();
		const startPeriod = betweenRangeMatch[3]?.toLowerCase() || endPeriod;
		result.startTime = normalizeTime(applyPeriod(parseInt(betweenRangeMatch[1]), startPeriod), betweenRangeMatch[2] ? parseInt(betweenRangeMatch[2]) : 0);
		result.endTime = normalizeTime(applyPeriod(parseInt(betweenRangeMatch[4]), endPeriod), betweenRangeMatch[5] ? parseInt(betweenRangeMatch[5]) : 0);
		foundTime = true;
		confidence += 0.25;
	}

	// Check all-day first
	if (['all day', 'all-day', 'whole day', 'birthday'].some(p => lower.includes(p))) {
		result.allDay = true;
		confidence += 0.15;
	}

	// ===== RECURRENCE =====
	// Compound phrases must come before bare words so we capture the full
	// expression ("every other week", not just "week"-less fragments).
	const recurrencePatterns: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
		[/\bmonthly\s+on\s+the\s+\d{1,2}(?:st|nd|rd|th)?\b/i, () => 'monthly'],
		[/\bweekly\s+on\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/i, () => 'weekly'],
		[/\bevery other\s+(?:day|week|month)\b/i, () => 'biweekly'],
		[/\bevery\s+(\d+)\s+(days?|weeks?|months?|years?)\b/i, (m) => `every_${m[1]}_${m[2].toLowerCase()}`],
		[/\bevery\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, () => 'weekly'],
		[/\b(?:daily|every day)\b/i, () => 'daily'],
		[/\bweekly\b/i, () => 'weekly'],
		[/\bmonthly\b/i, () => 'monthly'],
		[/\b(?:yearly|annually)\b/i, () => 'yearly']
	];
	const recurrencePhrases: string[] = [];
	for (const [pattern, value] of recurrencePatterns) {
		const m = input.match(pattern);
		if (m) {
			result.recurring = typeof value === 'function' ? value(m) : value;
			recurrencePhrases.push(m[0]);
			confidence += 0.2;
			break;
		}
	}

	// Weekday recurrence, single pass: "every Monday", "on wednesdays",
	// "every Mon, Wed, Fri". One token scan over dateInput (until-span
	// blanked, so "every Monday until Friday" never reads Friday as a day)
	// feeds every rule below — no second scan elsewhere.
	const DAY_TOKEN = 'mon(?:day)?|tue(?:s|sday)?|wed(?:nes|nesday)?|thu(?:r?s?(?:day)?)?|fri(?:day)?|sat(?:ur|urday)?|sun(?:day)?';
	const dayRaws = dateInput.match(new RegExp(`\\b(${DAY_TOKEN})s?\\b`, 'gi')) ?? [];
	const distinctDays = [...new Set(dayRaws.map(normalizeDayToken))].filter(
		(d): d is string => !!d
	);
	const anyPluralDay = dayRaws.some((t) => t.toLowerCase().endsWith('s'));
	const listTrigger = /\b(every|weekly|each)\b/i.test(dateInput);
	if (
		distinctDays.length >= 1 &&
		(!result.recurring || result.recurring === 'weekly') &&
		(listTrigger || anyPluralDay)
	) {
		// Note: two dateless singular weekdays ("meeting Monday and Tuesday",
		// no trigger word) fail the outer condition and stay a single event.
		result.recurring = 'weekly';
		result.recurringByDay = orderWeekdays(distinctDays);
		recurrencePhrases.push(...dayRaws);
		confidence += 0.2;
		if (!result.date) {
			result.date = nearestWeekday(distinctDays, zone).toFormat('yyyy-MM-dd');
		}
	}

	// Recurrence end: "for 6 weeks", "for 3 months", "5 times", "8 sessions".
	// Count is meaningless without a frequency, so a bare "buy milk 2 times"
	// or "party in 2 weeks" never sets it.
	const countMatch = input.match(/\bfor\s+(\d+)\s+(days?|weeks?|months?|years?|times?|occurrences?|sessions?)\b/i)
		?? input.match(/\b(\d+)\s+times?\b/i);
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
	const reminderMatch = input.match(/(?:remind\s+me|reminder)\s+(\d+)\s+(min(?:ute)?s?|hours?|days?)\s+before\b/i);
	if (reminderMatch) {
		const n = parseInt(reminderMatch[1]);
		const unit = reminderMatch[2].toLowerCase();
		result.reminderMinutes = n * (unit.startsWith('min') ? 1 : unit.startsWith('hour') ? 60 : 1440);
		confidence += 0.15;
		stripSpans.push(reminderMatch[0]);
	}

	// "starting at 6 PM", "at 8 AM", "beginning at 9 AM", "7:15A"
	// (?!\d) keeps bare 4-digit military time ("1830") from matching here.
	const startTimeMatch = input.match(/(?:start(?:ing)?\s+at|at|beginning\s+at)\s+(\d{1,2})(?::(\d{2}))?(?!\d)\s*(am?|pm?|AM?|PM?)?/i);

	// Standalone time: "9:00 AM", "7:15P", "3:30 PM" (may appear after date)
	if (!startTimeMatch && !foundTime) {
		const standaloneTimeMatch = input.match(/\b(\d{1,2}):(\d{2})\s*(am?|pm?|AM?|PM?)\b/i);
		if (standaloneTimeMatch) {
			let hour = parseInt(standaloneTimeMatch[1]);
			const minute = parseInt(standaloneTimeMatch[2]);
			const period = standaloneTimeMatch[3]?.toLowerCase();
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
		const timeMap: Record<string, string> = { noon: '12:00', midnight: '00:00', dusk: '20:00', dawn: '06:00' };
		result.startTime = timeMap[specialTimeMatch[1].toLowerCase()];
		foundTime = true;
		confidence += 0.2;
	}

	// Colloquial fractions: "half past seven pm", "quarter to nine am", "quarter past two pm"
	const WORD_HOUR: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
	const colloquialMatch = input.match(new RegExp(`\\b(half\\s+past|quarter\\s+to|quarter\\s+past)\\s+(\\d{1,2}|${Object.keys(WORD_HOUR).join('|')})\\s*(am|pm)?\\b`, 'i'));
	if (colloquialMatch && !foundTime) {
		const kind = colloquialMatch[1].toLowerCase().replace(/\s+/g, ' ');
		const rawHour = colloquialMatch[2].toLowerCase();
		let hour = /^\d+$/.test(rawHour) ? parseInt(rawHour) : WORD_HOUR[rawHour];
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

	// Military / compact 24h: "1830" (not years like 2026)
	const militaryMatch = input.match(/(?<![\d:])(\d{2})(\d{2})(?!\d)/);
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
		const todMap: Record<string, string> = { 'early morning': '06:00', morning: '09:00', afternoon: '14:00', evening: '18:00' };
		result.startTime = todMap[timeOfDayMatch[1].toLowerCase()];
		foundTime = true;
		confidence += 0.15;
	}

	// "kicking off at 5 PM"
	const kickOffMatch = input.match(/kicking\s+off\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i);
	if (kickOffMatch && !foundTime) {
		let hour = parseInt(kickOffMatch[1]);
		const period = kickOffMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.startTime = normalizeTime(hour);
		foundTime = true;
		confidence += 0.2;
	}

	// "departing at 5 AM", "leaving at 6 AM"
	const leaveMatch = input.match(/(?:leaving|departing)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i);
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
	const fromToMatch = input.match(/from\s+(\d{1,2})(?:(?::(\d{2})))?\s*(am?|pm?)?\s+to\s+(\d{1,2})(?:(?::(\d{2})))?\s*(am?|pm?)?/i);
	if (fromToMatch && !foundTime) {
		let startHour = parseInt(fromToMatch[1]);
		let startMin = fromToMatch[2] ? parseInt(fromToMatch[2]) : 0;
		let endHour = parseInt(fromToMatch[4]);
		let endMin = fromToMatch[5] ? parseInt(fromToMatch[5]) : 0;
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
	const finishMatch = input.match(/(?:finishes?(?:\s+around\s+)?|(?:finishing|concludes?)(?:\s+at\s+)?)(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i);
	if (finishMatch && !result.endTime) {
		let hour = parseInt(finishMatch[1]);
		const period = finishMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.endTime = normalizeTime(hour);
		confidence += 0.15;
	}

	// "going on until 9 PM", "continuing until 9 PM"
	const continueMatch = input.match(/(?:going\s+on|continuing)\s+until\s+(?:around\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i);
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
	const lastingMatch = input.match(/lasting\s+(?:for\s+)?(?:about\s+)?(\d+)\s+(minutes?|mins?|min|hours?|hrs?|hr)\b/i);
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
	const closeMatch = input.match(/(?:closing|ending)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i);
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
	const endsAtMatch = input.match(/(?:ends?|finishing)\s+(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)/i);
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
	}

	// "returning by 2 PM", "back by 6 PM" → end time
	const returnByMatch = input.match(/(?:returning|back)\s+by\s+(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)/i);
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
	const explicitLocMatch = input.match(/\blocation\s*:\s*(.+?)(?:\n|$|type:|date:|time:|description:)/i);
	if (explicitLocMatch) {
		result.location = explicitLocMatch[1].trim();
		confidence += 0.25;
	}

	// "location at X" or "location is X"
	const locKeywordMatch = input.match(/\blocation\s+(?:at|is|in)\s+([A-Za-z][a-z0-9 ]*)/i);
	if (locKeywordMatch && !result.location) {
		result.location = locKeywordMatch[1].trim();
		confidence += 0.2;
	}

	// "at X" where X is a short uppercase token (e.g. "at LU", "at HR")
	const atShortLocMatch = input.match(/\bat\s+([A-Z]{1,4})\b/);
	if (atShortLocMatch && !result.location) {
		result.location = atShortLocMatch[1];
		confidence += 0.15;
	}

	// Compromise places, lazily and only as a fallback: explicit locations
	// ("location: X", "at X") already won above and must not be overwritten.
	if (!result.location) {
		const places = getDoc().places().out('array');
		if (places.length > 0) {
			result.location = places[0];
			confidence += 0.15;
		}
	}

	// "at the X" - capture multi-word locations like "neighborhood clubhouse", "yoga studio"
	const atLocMatch = input.match(/at\s+the\s+([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)*)/);
	if (atLocMatch && !result.location) {
		let loc = atLocMatch[1];
		// Stop at conjunctions/prepositions
		loc = loc.replace(/\s+(?:and|but|with|for|to|by|because|since)\s+.*$/, '');
		result.location = loc;
		confidence += 0.15;
	}

	// "in the X" - capture locations like "downtown square"
	const inLocMatch = input.match(/in\s+the\s+([a-z]+(?:\s+[a-z]+)*)/i);
	if (inLocMatch && !result.location) {
		result.location = inLocMatch[1];
		confidence += 0.15;
	}

	// "at home"
	const atHomeMatch = input.match(/\bat\s+home\b/i);
	if (atHomeMatch && !result.location) {
		result.location = 'Home';
		confidence += 0.1;
	}

	// "at my apartment on 42 Maple Drive" or "at my apartment"
	const myPlaceMatch = input.match(/at\s+(?:my|our)\s+([a-z]+)(?:\s+on\s+(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*))?/i);
	if (myPlaceMatch && !result.location) {
		if (myPlaceMatch[2]) {
			// Has address after "on"
			result.location = myPlaceMatch[2].trim();
		} else {
			result.location = myPlaceMatch[1] ? myPlaceMatch[1].charAt(0).toUpperCase() + myPlaceMatch[1].slice(1) : 'Home';
		}
		confidence += 0.1;
	}

	// Address: "at 450 Main Street" or standalone address
	// Match address pattern: number + street name, possibly after "on"
	const addressMatch = input.match(/\bon\s+(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
	if (addressMatch && !result.location) {
		result.location = addressMatch[1].trim();
		confidence += 0.15;
	}

	// "at X studio", "at X center", "at X park" - general location patterns
	const generalLocMatch = input.match(/at\s+(?:the\s+)?([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)*\s+(?:studio|center|park|garden|square|clubhouse|trailhead))/i);
	if (generalLocMatch && !result.location) {
		result.location = generalLocMatch[1].trim();
		confidence += 0.15;
	}

	// Strip trailing punctuation from location
	if (result.location) {
		result.location = result.location.replace(/[.,;:!?]+$/, '');
	}

	// Calendar targeting: "on the family calendar", "to my work calendar".
	// Stores the raw name; the caller matches it against the user's calendars.
	const calendarMatch = input.match(/\b(?:on|to)\s+(?:the\s+|my\s+)?([A-Za-z][A-Za-z ]*?)\s+calendar\b/i);
	if (calendarMatch) {
		result.calendarName = `${calendarMatch[1].trim()} calendar`;
		confidence += 0.15;
		stripSpans.push(calendarMatch[0]);
	}

	// ===== ATTENDANT PATTERNS =====
	// Cheap matchers first; compromise people() runs last and only when
	// nothing matched, so most parses never pay for a second NLP doc.

	// "with X"
	const withMatch = input.match(/with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
	if (withMatch && (!result.attendants || result.attendants.length === 0)) {
		result.attendants = withMatch.map(m => m.replace(/^with\s+/i, '').trim());
		confidence += 0.15;
	}

	// "invite X" / "invite Jay and Mo" — explicit beats guessed.
	const inviteMatch = input.match(/\binvite\s+([^,.]+)/i);
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
		/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+I\s+(?:are|will|would|having|hosting|throwing|planning|organizing|going|traveling|performing|reviewing|putting|launching)\b[^\.]*/i,
		/(You\s+and\s+I\s+(?:and\s+the\s+rest\s+of\s+)?[^\.]+)/i,
		/(Us\s+(?:three\s+)?[a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+and\s+the\s+[a-z]+)?\s+(?:are|will|going|having|hosting|putting))/i,
		/(Our\s+[a-z]+(?:\s+[a-z]+)*\s+and\s+I\s+(?:are|will|having|hosting|throwing|planning|organizing|going|traveling|performing|reviewing))/i,
		/(The\s+[a-z]+(?:\s+[a-z]+)*\s+and\s+I\s+(?:are|will|having|hosting|throwing|planning|organizing|going|traveling|reviewing|clean|having))/i,
		/(My\s+[a-z]+(?:\s+[a-z]+)*\s+and\s+I\s+(?:are|will|having|hosting|throwing|planning|organizing|going|traveling))/i
	];

	if (!result.attendants || result.attendants.length === 0) {
		for (const pattern of speakerPatterns) {
			const match = input.match(pattern);
			if (match && match[1] && match[1].length > 3 && match[1].length < 80) {
				const peoplePart = match[1].replace(/\s+(are|will|would|having|hosting|throwing|planning|organizing|going|traveling|performing|reviewing|putting|launching|hit|hitting|clean|having|putting)\s*$/i, '').trim();
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
		/(?:including|expecting|investors?|about\s+\d+\s+(?:people|attendees?|volunteers?|members?|parents?|chaperones?)|the\s+whole\s+[a-z]+)\s+([^,\.]+)/gi
	];

	for (const pattern of groupPatterns) {
		const match = input.match(pattern);
		if (match && match[1] && match[1].length > 2 && match[1].length < 60) {
			result.attendants = [match[1].trim()];
			confidence += 0.1;
			break;
		}
	}

	// Compromise people() last, only when nothing matched — and on text with
	// the detected location removed so places aren't read as people.
	if (!result.attendants || result.attendants.length === 0) {
		let attendantText = input;
		if (result.location) {
			attendantText = input.replace(new RegExp(result.location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
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
	// Always take first 50 chars of input as title (simplified)
	let titleSource = input;
	// Recurrence phrases describe the schedule, not the event name.
	for (const phrase of recurrencePhrases) {
		const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		titleSource = titleSource.replace(new RegExp(escaped, 'i'), ' ');
	}
	titleSource = titleSource.replace(/\s{2,}/g, ' ').trimStart();
	let title = titleSource.substring(0, 50);
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
		const strippedWindow = stripTitleSpans(window, [...recurrencePhrases, ...stripSpans]);
		if (strippedWindow !== window && window) {
			const cleaned = cleanTitleText(strippedWindow);
			const final = cleaned.replace(/[.,;:!?]+$/, '');
			if (final.length > 3 && !/^[\s,]*$/.test(final)) {
				result.title = final;
			} else {
				const fallback = input.substring(0, 50).replace(/[.,;:!?]+$/, '');
				if (fallback.length > 0) result.title = fallback;
			}
		}
	}

	// ===== LOCATION FROM @ SYMBOL =====
	// Handle "Event Title @ Location" pattern
	if (input.includes('@')) {
		const afterAt = input.substring(input.indexOf('@') + 1).trim();
		
		if (afterAt.length > 0 && !result.location) {
			// Stop at date patterns, time patterns, "View & RSVP", etc.
			const stopRegex = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}|thursday|friday|saturday|sunday|monday|tuesday|wednesday|\d{1,2}:\d{2}\s*(?:am|pm)|\b(?:view\s*&\s*rsvp|event\s*details)\b/gi;
			
			let locationPart = afterAt;
			const stopMatch = locationPart.search(stopRegex);
			if (stopMatch > 0) {
				locationPart = locationPart.substring(0, stopMatch);
			}
			
			const cleanedLocation = locationPart
				.replace(/\s+/g, ' ')
				.trim();
			
			if (cleanedLocation.length > 0 && cleanedLocation.length < 100) {
				result.location = cleanedLocation;
				confidence += 0.15;
			}
		}
	}

	// ===== DEFAULTS =====
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

/** Minimum confidence for a segment to count as its own event. */
const MIN_SEGMENT_CONFIDENCE = 0.3;

/**
 * Multi-event segmentation (item 5). Splits on semicolons/newlines and on
 * "and" only when both sides carry date/time signals, parses each segment
 * independently, and falls back to a single result when fewer than two
 * segments clear the confidence gate — never degrading the common case.
 */
export function parseEventList(input: string, zone?: string): ParseResult[] {
	const hardSplit = input.split(/[;\n]+/).map((s) => s.trim()).filter((s) => s.length > 0);
	const candidates = hardSplit.length > 1 ? hardSplit : splitOnAnd(input);
	if (candidates.length < 2) return [parseEventInput(input, zone)];
	const parsed = candidates.map((c) => parseEventInput(c, zone));
	if (parsed.filter((p) => p.confidence >= MIN_SEGMENT_CONFIDENCE).length < 2) {
		return [parseEventInput(input, zone)];
	}
	return parsed;
}

/** Split on "and" between two signal-bearing halves, else no split. */
function splitOnAnd(input: string): string[] {
	const parts = input.split(/\band\b/i);
	if (parts.length < 2) return [input];
	// Only split when every part carries its own signal.
	if (!parts.every((p) => SEGMENT_SIGNAL.test(p))) return [input];
	return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}
