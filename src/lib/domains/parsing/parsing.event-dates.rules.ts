/**
 * parsing event dates — the date chain and the explicit-date sweep.
 *
 * First match wins down the chain: `this <weekday>`, `next <weekday>`,
 * today, tomorrow, `in N days|weeks|months`, `in N min|hrs`, weekend,
 * `next <month>`, `returning [by] <weekday> [daypart]`, month-day,
 * day-first, ISO, ordinal digit-first, ordinal word, ordinal weekday,
 * `MM/DD`. The sweep then collects EVERY named date with its span, so a
 * chain of dates can fan out into one event per date.
 *
 * `now` is the caller's instant already resolved in the caller's zone, so
 * nothing here reads a clock (R5). Month arithmetic and the one rollover
 * rule come from `kernel/time` (K-06).
 */
import { DateTime } from 'luxon';
import type { CalendarDate } from '$lib/kernel/time/dates';
import { daysUntilWeekday, resolveMonthDay } from '$lib/kernel/time/dates';
import type { ClaimBook } from './parsing.claims.rules';
import {
	DAYPART_TIMES,
	MONTH_ALT,
	MONTH_INDEX_1,
	ORDINAL_WORD_MAP,
	ORDINAL_WORDS_PATTERN,
	dayNumber
} from './parsing.vocabulary.rules';

/** Fan-out ceiling for a date chain: one event per date, never a blast. */
const MAX_SPAN_DATES = 5;

/** What the date family read, and how much confidence it earned. */
export interface EventDateReading {
	date?: string;
	dates?: string[];
	/** `in 48hrs` also lands the wall-clock start. */
	startTime?: string;
	/** "returning Sunday morning" anchors an end time. */
	endTime?: string;
	confidence: number[];
}

/** JS weekday number for a (lowercased) full day name, or null. */
function parseDayOfWeek(day: string): number | null {
	return dayNumber(day.toLowerCase()) ?? null;
}

/** Next strictly-future occurrence of a weekday, in `now`'s zone. */
export function nextWeekday(day: string, now: DateTime): DateTime {
	const dayNum = parseDayOfWeek(day);
	if (dayNum === null) return now;
	return now.plus({ days: daysUntilWeekday(now.weekday % 7, dayNum) });
}

/**
 * nth (or last) weekday of a month → DateTime, or null when it cannot exist
 * (e.g. a fifth Monday in a 4-Monday month). luxonWeekday: 1=Mon..7=Sun.
 */
export function ordinalWeekdayOfMonth(
	year: number,
	month: number,
	luxonWeekday: number,
	which: 'first' | 'second' | 'third' | 'fourth' | 'fifth' | 'last',
	zone: string
): DateTime | null {
	if (which === 'last') {
		let dt = DateTime.fromObject({ year, month, day: 1 }, { zone }).endOf('month');
		while (dt.weekday !== luxonWeekday) dt = dt.minus({ days: 1 });
		return dt;
	}
	const n = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 }[which];
	let dt = DateTime.fromObject({ year, month, day: 1 }, { zone });
	while (dt.weekday !== luxonWeekday) dt = dt.plus({ days: 1 });
	dt = dt.plus({ weeks: n - 1 });
	return dt.month === month ? dt : null;
}

/**
 * The one rollover rule, through kernel/time: an explicit year wins;
 * otherwise this year, rolling +1 only when the month-day sits strictly
 * before today (today stays today); a clamped day ("feb 30") never rolls.
 * An impossible month-day is an invalid DateTime the caller's `.toFormat`
 * turns into `"Invalid DateTime"` — the legacy wire accident (Q-009).
 */
export function withRolloverYear(
	month: number,
	day: number,
	explicitYear: number | null,
	now: DateTime
): DateTime {
	const today: CalendarDate = { year: now.year, month: now.month, day: now.day };
	const resolved = resolveMonthDay(today, month, day, explicitYear);
	if (!resolved) return DateTime.invalid('unparseable month-day');
	return DateTime.fromObject(resolved, { zone: (now.zoneName ?? 'UTC') });
}

/** Resolve the early-captured "until <date>" match to YYYY-MM-DD. */
export function resolveUntilDate(m: RegExpMatchArray, now: DateTime): string | null {
	let dt: DateTime | null = null;
	if (m[1]) {
		dt = DateTime.fromObject({ year: +m[1], month: +m[2], day: +m[3] }, { zone: (now.zoneName ?? 'UTC') });
	} else if (m[4]) {
		const month = MONTH_INDEX_1[m[4].toLowerCase()];
		if (month) dt = withRolloverYear(month, parseInt(m[5]), m[6] ? parseInt(m[6]) : null, now);
	} else if (m[7]) {
		const month = MONTH_INDEX_1[m[8].toLowerCase()];
		const day = parseInt(m[7]);
		if (month && day >= 1 && day <= 31) {
			dt = withRolloverYear(month, day, m[9] ? parseInt(m[9]) : null, now);
		}
	} else if (m[11]) {
		dt = nextWeekday(m[11], now);
		if (m[10]?.toLowerCase() === 'next') dt = dt.plus({ weeks: 1 });
	}
	return dt?.isValid ? dt.toFormat('yyyy-MM-dd') : null;
}

/** Monday-first ordering for by-day lists. */
export const WEEK_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

/** Nearest strictly-future date falling on one of the given day codes. */
export function nearestWeekday(days: string[], now: DateTime): DateTime {
	let best = 7;
	for (const d of days) {
		const target = WEEK_ORDER.indexOf(d as (typeof WEEK_ORDER)[number]) + 1;
		const delta = daysUntilWeekday(now.weekday, target);
		if (delta < best) best = delta;
	}
	return now.plus({ days: best });
}

/**
 * The date chain plus the explicit-date sweep. Claims every span it consumed
 * in the book and pushes the exact schedule spans the title step strips.
 */
export function readEventDates(
	dateInput: string,
	now: DateTime,
	claims: ClaimBook,
	stripSpans: string[]
): EventDateReading {
	const reading: EventDateReading = { confidence: [] };
	const setDate = (value: string) => {
		reading.date = value;
	};

	// "this Friday", "this Saturday"
	const thisDayMatch = dateInput.match(
		/\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
	);
	if (thisDayMatch) {
		setDate(nextWeekday(thisDayMatch[1], now).toFormat('yyyy-MM-dd'));
		stripSpans.push(thisDayMatch[0]);
		claims.claim(thisDayMatch[0], thisDayMatch.index);
		reading.confidence.push(0.25);
	}

	// "next Wednesday", "next Tuesday"
	const nextDayMatch = dateInput.match(
		/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
	);
	if (nextDayMatch && !reading.date) {
		setDate(nextWeekday(nextDayMatch[1], now).plus({ weeks: 1 }).toFormat('yyyy-MM-dd'));
		stripSpans.push(nextDayMatch[0]);
		claims.claim(nextDayMatch[0], nextDayMatch.index);
		reading.confidence.push(0.25);
	}

	// "today"
	const todayMatch = dateInput.match(/\btoday\b/i);
	if (todayMatch && !reading.date) {
		setDate(now.toFormat('yyyy-MM-dd'));
		stripSpans.push(todayMatch[0]);
		claims.claim(todayMatch[0], todayMatch.index);
		reading.confidence.push(0.2);
	}

	// "tomorrow"
	const tomorrowMatch = dateInput.match(/\btomorrow\b/i);
	if (tomorrowMatch && !reading.date) {
		setDate(now.plus({ days: 1 }).toFormat('yyyy-MM-dd'));
		stripSpans.push(tomorrowMatch[0]);
		claims.claim(tomorrowMatch[0], tomorrowMatch.index);
		reading.confidence.push(0.2);
	}

	// "in 3 days", "in 2 weeks", "in a month"
	const relativeMatch = dateInput.match(/\bin\s+(a|\d+)\s+(day|week|month)s?\b/i);
	if (relativeMatch && !reading.date) {
		const n = relativeMatch[1].toLowerCase() === 'a' ? 1 : parseInt(relativeMatch[1]);
		stripSpans.push(relativeMatch[0]);
		claims.claim(relativeMatch[0], relativeMatch.index);
		const unit = relativeMatch[2].toLowerCase();
		setDate(
			(unit === 'week'
				? now.plus({ weeks: n })
				: unit === 'month'
					? now.plus({ months: n })
					: now.plus({ days: n })
			).toFormat('yyyy-MM-dd')
		);
		reading.confidence.push(0.25);
	}

	// "in 48hrs", "in 90 minutes", "in 2 hours" — clock-relative durations
	// land the start point itself: date AND wall-clock start.
	const relativeDurationMatch = dateInput.match(
		/\bin\s+(a|\d+)\s*(minutes?|mins?|min|hours?|hrs?|hr)s?\b/i
	);
	if (relativeDurationMatch && !reading.date) {
		const n =
			relativeDurationMatch[1].toLowerCase() === 'a' ? 1 : parseInt(relativeDurationMatch[1]);
		const unit = relativeDurationMatch[2].toLowerCase();
		const point = unit.startsWith('h') ? now.plus({ hours: n }) : now.plus({ minutes: n });
		stripSpans.push(relativeDurationMatch[0]);
		claims.claim(relativeDurationMatch[0], relativeDurationMatch.index);
		setDate(point.toFormat('yyyy-MM-dd'));
		reading.startTime = point.toFormat('HH:mm');
		reading.confidence.push(0.25);
	}

	// "this weekend", "weekend" -> the upcoming Saturday
	const weekendMatch = dateInput.match(/\b(?:this\s+|next\s+)?weekend\b/i);
	if (weekendMatch && !reading.date) {
		const daysUntilSat = daysUntilWeekday(now.weekday % 7, 6);
		stripSpans.push(weekendMatch[0]);
		claims.claim(weekendMatch[0], weekendMatch.index);
		setDate(now.plus({ days: daysUntilSat }).toFormat('yyyy-MM-dd'));
		reading.confidence.push(0.2);
	}

	// "next <month>" - "next May", "next September" — always next year
	const nextMonthMatch = dateInput.match(new RegExp(`\\bnext\\s+(${MONTH_ALT})\\b`, 'i'));
	if (nextMonthMatch && !reading.date) {
		const month = MONTH_INDEX_1[nextMonthMatch[1].toLowerCase()];
		setDate(
			DateTime.fromObject({ year: now.year + 1, month, day: 1 }, { zone: (now.zoneName ?? 'UTC') }).toFormat(
				'yyyy-MM-dd'
			)
		);
		stripSpans.push(nextMonthMatch[0]);
		claims.claim(nextMonthMatch[0], nextMonthMatch.index);
		reading.confidence.push(0.2);
	}

	// "returning this Sunday", "returning by Saturday"
	const returnDayMatch = dateInput.match(
		/returning\s+(?:by\s+)?(?:this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+(morning|afternoon|evening|noon))?/i
	);
	if (returnDayMatch && !reading.date) {
		setDate(nextWeekday(returnDayMatch[1], now).toFormat('yyyy-MM-dd'));
		stripSpans.push(returnDayMatch[0]);
		claims.claim(returnDayMatch[0], returnDayMatch.index);
		if (returnDayMatch[2]) {
			reading.endTime = DAYPART_TIMES[returnDayMatch[2].toLowerCase()] ?? '18:00';
		}
		reading.confidence.push(0.2);
	}

	// Month and day: "July 12th", "Aug 30", "Sept 5", "Dec 25, 2026"
	const monthDayMatch = dateInput.match(
		new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`, 'i')
	);
	if (monthDayMatch && !reading.date) {
		const month = MONTH_INDEX_1[monthDayMatch[1].toLowerCase()];
		const day = parseInt(monthDayMatch[2]);
		const target = withRolloverYear(
			month,
			day,
			monthDayMatch[3] ? parseInt(monthDayMatch[3]) : null,
			now
		);
		setDate(target.toFormat('yyyy-MM-dd'));
		reading.confidence.push(0.3);
	}

	// Day-first with optional year: "21 Mar 2027", "12 August"
	const dayFirstMatch = dateInput.match(
		new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?(?:,?\\s*(20\\d{2}))?\\b`, 'i')
	);
	if (dayFirstMatch && !reading.date) {
		const day = parseInt(dayFirstMatch[1]);
		const month = MONTH_INDEX_1[dayFirstMatch[2].toLowerCase()];
		if (day >= 1 && day <= 31) {
			const target = withRolloverYear(
				month,
				day,
				dayFirstMatch[3] ? parseInt(dayFirstMatch[3]) : null,
				now
			);
			setDate(target.toFormat('yyyy-MM-dd'));
			reading.confidence.push(0.3);
		}
	}

	// ISO date: "2026-08-30"
	const isoDateMatch = dateInput.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
	if (isoDateMatch && !reading.date) {
		setDate(`${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`);
		reading.confidence.push(0.35);
	}

	// Ordinal-first: "3rd of May", "twenty-first of December"
	const ordinalFirstMatch = dateInput.match(
		new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)\\s+of\\s+(${MONTH_ALT})\\b`, 'i')
	);
	if (ordinalFirstMatch && !reading.date) {
		const month = MONTH_INDEX_1[ordinalFirstMatch[2].toLowerCase()];
		const day = parseInt(ordinalFirstMatch[1]);
		if (day >= 1 && day <= 31) {
			setDate(withRolloverYear(month, day, null, now).toFormat('yyyy-MM-dd'));
			reading.confidence.push(0.3);
		}
	}

	// Ordinal word-first: "third of May", "twenty-first of December"
	const ordinalWordMatch = dateInput.match(
		new RegExp(`\\b(${ORDINAL_WORDS_PATTERN})\\s+of\\s+(${MONTH_ALT})\\b`, 'i')
	);
	if (ordinalWordMatch && !reading.date) {
		const month = MONTH_INDEX_1[ordinalWordMatch[2].toLowerCase()];
		const rawWord = ordinalWordMatch[1].toLowerCase();
		const normalized = rawWord.replace(/\s+/g, ' ').trim();
		const day = ORDINAL_WORD_MAP[normalized];
		if (day) {
			setDate(withRolloverYear(month, day, null, now).toFormat('yyyy-MM-dd'));
			claims.claim(ordinalWordMatch[0], ordinalWordMatch.index);
			reading.confidence.push(0.3);
		}
	}

	// Ordinal weekday: "first Friday of October", "last Friday of the month".
	const ordinalDayMatch = dateInput.match(
		/\b(first|second|third|fourth|fifth|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+of\s+(the\s+month|january|february|march|april|may|june|july|august|september|october|november|december)\b/i
	);
	if (ordinalDayMatch && !reading.date) {
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
		let month = monthToken === 'the month' ? now.month : MONTH_INDEX_1[monthToken];
		let year = now.year;
		let target = ordinalWeekdayOfMonth(year, month, luxonDay, which, (now.zoneName ?? 'UTC'));
		const todayStart = now.startOf('day');
		if (target && target < todayStart) {
			if (monthToken === 'the month') {
				const next = now.plus({ months: 1 });
				month = next.month;
				year = next.year;
			} else {
				year += 1;
			}
			target = ordinalWeekdayOfMonth(year, month, luxonDay, which, (now.zoneName ?? 'UTC'));
		}
		if (target) {
			setDate(target.toFormat('yyyy-MM-dd'));
			reading.confidence.push(0.3);
		}
	}

	// Numeric date: "05/03", "12/25" (MM/DD). Same rollover rule as every
	// other spelling — and, as in the legacy chain, no validity guard here
	// (Q-009 pins the resulting "Invalid DateTime").
	const numericDateMatch = dateInput.match(/\b(\d{1,2})\/(\d{1,2})\b/);
	if (numericDateMatch && !reading.date) {
		const month = parseInt(numericDateMatch[1]);
		const day = parseInt(numericDateMatch[2]);
		setDate(withRolloverYear(month, day, null, now).toFormat('yyyy-MM-dd'));
		reading.confidence.push(0.3);
	}

	// Explicit-date sweep (multi-date + title spans): every calendar date
	// named in the input, not just the first.
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
		const month = MONTH_INDEX_1[sweep[1].toLowerCase()];
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
		const month = MONTH_INDEX_1[sweep[2].toLowerCase()];
		if (month && day >= 1 && day <= 31) {
			const dt = withRolloverYear(month, day, sweep[3] ? parseInt(sweep[3]) : null, now);
			if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
		}
	}
	const isoSweep = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
	while ((sweep = isoSweep.exec(dateInput)) !== null) {
		const dt = DateTime.fromObject(
			{ year: +sweep[1], month: +sweep[2], day: +sweep[3] },
			{ zone: (now.zoneName ?? 'UTC') }
		);
		if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
	}
	const numericSweep = /\b(\d{1,2})\/(\d{1,2})\b/g;
	while ((sweep = numericSweep.exec(dateInput)) !== null) {
		const dt = withRolloverYear(parseInt(sweep[1]), parseInt(sweep[2]), null, now);
		if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
	}
	const ordinalSweep = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)\\s+of\\s+(${MONTH_ALT})\\b`, 'gi');
	while ((sweep = ordinalSweep.exec(dateInput)) !== null) {
		const month = MONTH_INDEX_1[sweep[2].toLowerCase()];
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
		const month = monthToken === 'the month' ? now.month : MONTH_INDEX_1[monthToken];
		let target = ordinalWeekdayOfMonth(now.year, month, luxonDay, which, (now.zoneName ?? 'UTC'));
		if (target && target < now.startOf('day')) {
			target =
				monthToken === 'the month'
					? ordinalWeekdayOfMonth(
							now.plus({ months: 1 }).year,
							now.plus({ months: 1 }).month,
							luxonDay,
							which,
							(now.zoneName ?? 'UTC')
						)
					: ordinalWeekdayOfMonth(now.year + 1, month, luxonDay, which, (now.zoneName ?? 'UTC'));
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
		const base = DateTime.fromISO(prior.date, { zone: (now.zoneName ?? 'UTC') });
		const dt = DateTime.fromObject(
			{ year: base.year, month: base.month, day },
			{ zone: (now.zoneName ?? 'UTC') }
		);
		if (dt.isValid) pushExplicit(sweep.index, dt.toFormat('yyyy-MM-dd'), sweep[0]);
	}
	explicitDates.sort((a, b) => a.index - b.index);
	// Relative-day atoms join the sweep so "today and tomorrow" chains expand
	// like "sept 23 & 30" (issue 030).
	const relDates: Array<{ index: number; date: string; span: string }> = [];
	const relSweep = /\b(today|tomorrow|yesterday)\b/gi;
	while ((sweep = relSweep.exec(dateInput)) !== null) {
		const word = sweep[1].toLowerCase();
		const dt =
			word === 'today' ? now : word === 'tomorrow' ? now.plus({ days: 1 }) : now.minus({ days: 1 });
		relDates.push({ index: sweep.index, date: dt.toFormat('yyyy-MM-dd'), span: sweep[0] });
	}
	// Chain atoms absorb a bridging "the " ("today and the 5th of oct") so the
	// article strips away with the date span.
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
	// one event per date sharing the parsed time/venue, capped at 5.
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
	for (const atom of chainAtoms) {
		stripSpans.push(atom.span);
		claims.claim(atom.span, atom.index);
	}
	if (chains.length > 0) {
		const best = chains.reduce((a, b) => (b.length > a.length ? b : a));
		const dates = [...new Set(best.map((e) => e.date))].slice(0, MAX_SPAN_DATES);
		// Owner ruling, 2026-10-05: a phrase naming the same day twice collapses
		// to one date, not to no date — the surviving date is what was meant.
		if (dates.length >= 1) {
			reading.dates = dates;
			setDate(dates[0]);
		}
	}

	return reading;
}
