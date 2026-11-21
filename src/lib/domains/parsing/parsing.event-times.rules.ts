/**
 * parsing event times — ranges first, then single times, then end cues.
 *
 * Ranges are matched before single times so "5:30-6:30pm" never reads as a
 * start of 5:30 and nothing else, and a missing start meridiem inherits the
 * end's. These rules read only the URL-free text: Q-010 B, so a clock-like
 * substring inside a link never sets a start time.
 *
 * Nothing here reads a clock: every answer is a wall-clock `HH:mm`.
 */
import { DateTime } from 'luxon';
import type { ClaimBook } from './parsing.claims.rules';
import {
	TOD_TIMES,
	applyPeriod,
	normalizeMeridiem,
	normalizeTime
} from './parsing.vocabulary.rules';

/** Special time-of-day word → HH:mm. */
const SPECIAL_TIMES: Record<string, string> = {
	noon: '12:00',
	midnight: '00:00',
	dusk: '20:00',
	dawn: '06:00'
};

const WORD_HOUR: Record<string, number> = {
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

/** The time fields the two passes share, in the order they are filled. */
export interface EventTimeState {
	startTime?: string;
	endTime?: string;
	/** Set once any start-time rule has fired; later start rules are skipped. */
	foundTime: boolean;
}

/** A fresh, empty time state. */
export function createEventTimeState(): EventTimeState {
	return { foundTime: false };
}

/**
 * The range rules, in legacy order: colon range, `from … to`, `between …
 * and`, bare `6-8pm`. Each returns the confidence increments it earned, in
 * the order it earned them, so the caller's running total accumulates in
 * exactly the legacy order (the golden pins the floats).
 */
export function readEventTimeRanges(
	text: string,
	stripSpans: string[],
	times: EventTimeState
): number[] {
	const confidence: number[] = [];

	// "6:00PM - 8:00PM" (time range with hyphen) — must check BEFORE standalone time.
	// A missing start meridiem inherits the end one ("5:30-6:30pm" is evening).
	const hyphenRangeMatch = text.match(
		/(\d{1,2}):(\d{2})\s*((?:[ap])\.?\s?m\.?|am?|pm?)?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*((?:[ap])\.?\s?m\.?|am?|pm?)/i
	);
	if (hyphenRangeMatch) {
		let startHour = parseInt(hyphenRangeMatch[1]);
		const startMin = parseInt(hyphenRangeMatch[2]);
		let endHour = parseInt(hyphenRangeMatch[4]);
		const endMin = parseInt(hyphenRangeMatch[5]);
		const startPeriod = normalizeMeridiem(hyphenRangeMatch[3]);
		const endPeriod = normalizeMeridiem(hyphenRangeMatch[6]);
		const effectiveStart = startPeriod || endPeriod;
		if (effectiveStart === 'pm' && startHour < 12) startHour += 12;
		if (effectiveStart === 'am' && startHour === 12) startHour = 0;
		if (endPeriod === 'pm' && endHour < 12) endHour += 12;
		if (endPeriod === 'am' && endHour === 12) endHour = 0;
		times.startTime = normalizeTime(startHour, startMin);
		times.endTime = normalizeTime(endHour, endMin);
		times.foundTime = true;
		confidence.push(0.2);
	}

	// "from 2-4pm", "from 9 to 5 pm" (no colons; end carries the meridiem)
	const shortRangeMatch = text.match(
		/\bfrom\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i
	);
	if (shortRangeMatch && !times.foundTime) {
		const startPeriod = normalizeMeridiem(shortRangeMatch[3]);
		const endPeriod = normalizeMeridiem(shortRangeMatch[6]);
		const effectiveStartPeriod = startPeriod || endPeriod;
		times.startTime = normalizeTime(
			applyPeriod(parseInt(shortRangeMatch[1]), effectiveStartPeriod),
			shortRangeMatch[2] ? parseInt(shortRangeMatch[2]) : 0
		);
		times.endTime = normalizeTime(
			applyPeriod(parseInt(shortRangeMatch[4]), endPeriod),
			shortRangeMatch[5] ? parseInt(shortRangeMatch[5]) : 0
		);
		times.foundTime = true;
		confidence.push(0.25);
	}

	// "between 2 and 4 PM"
	const betweenRangeMatch = text.match(
		/\bbetween\s+(\d{1,2})(?::(\d{2}))?\s*((?:[ap])\.?\s?m\.?|am|pm)?\s+and\s+(\d{1,2})(?::(\d{2}))?\s*((?:[ap])\.?\s?m\.?|am|pm)/i
	);
	if (betweenRangeMatch && !times.foundTime) {
		const endPeriod = normalizeMeridiem(betweenRangeMatch[6]);
		const startPeriod = normalizeMeridiem(betweenRangeMatch[3]) || endPeriod;
		times.startTime = normalizeTime(
			applyPeriod(parseInt(betweenRangeMatch[1]), startPeriod),
			betweenRangeMatch[2] ? parseInt(betweenRangeMatch[2]) : 0
		);
		times.endTime = normalizeTime(
			applyPeriod(parseInt(betweenRangeMatch[4]), endPeriod),
			betweenRangeMatch[5] ? parseInt(betweenRangeMatch[5]) : 0
		);
		times.foundTime = true;
		confidence.push(0.25);
	}

	// "6-8pm", "6-8 pm", "6 to 8pm" — bare hour range whose END carries the
	// meridiem; bare digits without one ("20-30 pages") never match.
	const bareRangeMatch = !times.foundTime
		? text.match(
				/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|\bto\b)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i
			)
		: null;
	if (bareRangeMatch) {
		const startPeriod = normalizeMeridiem(bareRangeMatch[3]);
		const endPeriod = normalizeMeridiem(bareRangeMatch[6]);
		const effectiveStartPeriod = startPeriod || endPeriod;
		times.startTime = normalizeTime(
			applyPeriod(parseInt(bareRangeMatch[1]), effectiveStartPeriod),
			bareRangeMatch[2] ? parseInt(bareRangeMatch[2]) : 0
		);
		times.endTime = normalizeTime(
			applyPeriod(parseInt(bareRangeMatch[4]), endPeriod),
			bareRangeMatch[5] ? parseInt(bareRangeMatch[5]) : 0
		);
		times.foundTime = true;
		confidence.push(0.25);
		stripSpans.push(bareRangeMatch[0]);
	}

	return confidence;
}

/**
 * The single-time and end-time rules, continuing from whatever the range
 * pass found. Reads the claim-masked view for compact military time only —
 * like every other rule here, from the URL-free text (Q-010 B).
 */
export function readEventTimes(
	text: string,
	claims: ClaimBook,
	stripSpans: string[],
	times: EventTimeState
): number[] {
	const confidence: number[] = [];

	// "starting at 6 PM", "at 8 AM", "beginning at 9 AM", "7:15A"
	// (?!\d) keeps bare 4-digit military time ("1830") from matching here.
	const startTimeMatch = text.match(
		/(?:start(?:ing)?\s+at|at|beginning\s+at)\s+(\d{1,2})(?::(\d{2}))?(?!\d)\s*((?:[ap])\.?\s?m\.?|am?|pm?)?/i
	);

	// Standalone time: "9:00 AM", "7:15P", "3:30 PM", "8:00 p.m." (#207).
	// Bare meridiem form without colon or "at" ("mon and tue 6am") follows.
	if (!startTimeMatch && !times.foundTime) {
		const standaloneTimeMatch = text.match(
			/\b(\d{1,2}):(\d{2})\s*((?:[ap])\.?\s?m\.?|[ap]m?)(?![a-z0-9])/i
		);
		const bareMeridiemMatch = standaloneTimeMatch
			? null
			: text.match(/(?<![\d:])(\d{1,2})\s*((?:[ap])\.?\s?m\.?|[ap]m)(?![a-z0-9])/i);
		const timeMatch: RegExpMatchArray | null = standaloneTimeMatch ?? bareMeridiemMatch;
		const isColonTime = standaloneTimeMatch !== null;
		if (timeMatch) {
			let hour = parseInt(timeMatch[1]);
			let minute = 0;
			let period: string | undefined;
			if (isColonTime && standaloneTimeMatch) {
				minute = parseInt(standaloneTimeMatch[2]);
				period = normalizeMeridiem(standaloneTimeMatch[3]);
			} else if (bareMeridiemMatch) {
				// SAFETY: bareMeridiemMatch has exactly the two groups (hour, meridiem).
				period = normalizeMeridiem(bareMeridiemMatch[2]);
			}
			if (period === 'pm' && hour < 12) hour += 12;
			if (period === 'am' && hour === 12) hour = 0;
			times.startTime = normalizeTime(hour, minute);
			times.foundTime = true;
			confidence.push(0.25);
		}
	}
	if (startTimeMatch) {
		let hour = parseInt(startTimeMatch[1]);
		const minute = startTimeMatch[2] ? parseInt(startTimeMatch[2]) : 0;
		const period = normalizeMeridiem(startTimeMatch[3]);
		if (period === 'pm' && hour < 12) hour += 12;
		if (period === 'am' && hour === 12) hour = 0;
		if (!period && hour < 8) hour += 12;
		times.startTime = normalizeTime(hour, minute);
		times.foundTime = true;
		confidence.push(0.25);
	}

	// Special times: "at noon", "at midnight", "at dusk", "at dawn"
	const specialTimeMatch = text.match(/\bat\s+(noon|midnight|dusk|dawn)\b/i);
	if (specialTimeMatch && !times.foundTime) {
		times.startTime = SPECIAL_TIMES[specialTimeMatch[1].toLowerCase()];
		times.foundTime = true;
		confidence.push(0.2);
	}

	// Colloquial fractions: "half past seven pm", "quarter to nine am"
	const colloquialMatch = text.match(
		new RegExp(
			`\\b(half\\s+past|quarter\\s+to|quarter\\s+past)\\s+(\\d{1,2}|${Object.keys(WORD_HOUR).join('|')})\\s*((?:[ap])\\.?\\s?m\\.?(?![a-z])|am|pm)?\\b`,
			'i'
		)
	);
	if (colloquialMatch && !times.foundTime) {
		const kind = colloquialMatch[1].toLowerCase().replace(/\s+/g, ' ');
		const rawHour = colloquialMatch[2].toLowerCase();
		const hour = /^\d+$/.test(rawHour) ? parseInt(rawHour) : (WORD_HOUR[rawHour] ?? 0);
		const period = normalizeMeridiem(colloquialMatch[3]);
		if (kind === 'half past') {
			times.startTime = normalizeTime(applyPeriod(hour, period), 30);
		} else if (kind === 'quarter past') {
			times.startTime = normalizeTime(applyPeriod(hour, period), 15);
		} else {
			// quarter TO nine = 8:45
			times.startTime = normalizeTime(applyPeriod(hour - 1, period), 45);
		}
		times.foundTime = true;
		confidence.push(0.25);
	}

	// Claim-masked view (issue 112): compact military time must not read the
	// digit runs a date family claimed. Every consumer below that reads the
	// masked view uses this same string.
	const claimMasked = claims.mask(text);

	// Military / compact 24h: "1830" (not years like 2026). A claimed
	// candidate is skipped and the scan continues to the next digit run.
	let militaryStart: { hh: number; mm: number } | null = null;
	for (const m of claimMasked.matchAll(/(?<![\d:])(\d{2})(\d{2})(?!\d)/g)) {
		const hh = parseInt(m[1]);
		const mm = parseInt(m[2]);
		if (/^20\d{2}$/.test(m[0])) continue;
		if (hh <= 23 && mm <= 59) {
			militaryStart = { hh, mm };
			break;
		}
	}
	if (militaryStart && !times.foundTime) {
		times.startTime = normalizeTime(militaryStart.hh, militaryStart.mm);
		times.foundTime = true;
		confidence.push(0.25);
	}

	// Time of day: "early morning", "morning", "afternoon", "evening"
	const timeOfDayMatch = text.match(/\b(early\s+morning|morning|afternoon|evening)\b/i);
	if (timeOfDayMatch && !times.foundTime) {
		times.startTime = TOD_TIMES[timeOfDayMatch[1].toLowerCase()];
		times.foundTime = true;
		confidence.push(0.15);
	}

	// "kicking off at 5 PM"
	const kickOffMatch = text.match(
		/kicking\s+off\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i
	);
	if (kickOffMatch && !times.foundTime) {
		let hour = parseInt(kickOffMatch[1]);
		const period = kickOffMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		times.startTime = normalizeTime(hour);
		times.foundTime = true;
		confidence.push(0.2);
	}

	// "departing at 5 AM", "leaving at 6 AM"
	const leaveMatch = text.match(/(?:leaving|departing)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i);
	if (leaveMatch && !times.foundTime) {
		let hour = parseInt(leaveMatch[1]);
		const minute = leaveMatch[2] ? parseInt(leaveMatch[2]) : 0;
		const period = leaveMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		if (period === 'am' && hour === 12) hour = 0;
		times.startTime = normalizeTime(hour, minute);
		times.foundTime = true;
		confidence.push(0.2);
	}

	// "arriving at 10 AM", "arriving by 1 PM"
	const arriveMatch = text.match(/arriving\s+(?:at|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i);
	if (arriveMatch && !times.foundTime) {
		let hour = parseInt(arriveMatch[1]);
		const minute = arriveMatch[2] ? parseInt(arriveMatch[2]) : 0;
		const period = arriveMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		times.startTime = normalizeTime(hour, minute);
		times.foundTime = true;
		confidence.push(0.2);
	}

	// Glued/spelled article times: "a5pm", "a830am", "a 9pm" (typo for "at").
	// The meridiem is mandatory so "a 5 minute break" never matches.
	const articleTimeMatch = text.match(/\ba\s*(\d{1,2})(?::?(\d{2}))?\s*(am|pm)\b/i);
	if (articleTimeMatch && !times.foundTime) {
		let hour = parseInt(articleTimeMatch[1]);
		const minute = articleTimeMatch[2] ? parseInt(articleTimeMatch[2]) : 0;
		const period = articleTimeMatch[3].toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		if (period === 'am' && hour === 12) hour = 0;
		times.startTime = normalizeTime(hour, minute);
		times.foundTime = true;
		confidence.push(0.2);
	}

	// "from 9 AM to 5 PM"
	const fromToMatch = text.match(
		/from\s+(\d{1,2})(?:(?::(\d{2})))?\s*(am?|pm?)?\s+to\s+(\d{1,2})(?:(?::(\d{2})))?\s*(am?|pm?)?/i
	);
	if (fromToMatch && !times.foundTime) {
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
		times.startTime = normalizeTime(startHour, startMin);
		times.endTime = normalizeTime(endHour, endMin);
		times.foundTime = true;
		confidence.push(0.2);
	}

	// End time: "wrapping up around 9 PM"
	const wrapMatch = text.match(/wrapping\s+up\s+(?:around\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (wrapMatch && !times.endTime) {
		let hour = parseInt(wrapMatch[1]);
		const period = wrapMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		times.endTime = normalizeTime(hour);
		confidence.push(0.15);
	}

	// "finishing around 11 AM", "finishes around 11 AM", "concludes at 7 AM"
	const finishMatch = text.match(
		/(?:finishes?(?:\s+around\s+)?|(?:finishing|concludes?)(?:\s+at\s+)?)(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i
	);
	if (finishMatch && !times.endTime) {
		let hour = parseInt(finishMatch[1]);
		const period = finishMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		times.endTime = normalizeTime(hour);
		confidence.push(0.15);
	}

	// "going on until 9 PM", "continuing until 9 PM"
	const continueMatch = text.match(
		/(?:going\s+on|continuing)\s+until\s+(?:around\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i
	);
	if (continueMatch && !times.endTime) {
		let hour = parseInt(continueMatch[1]);
		const period = continueMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		times.endTime = normalizeTime(hour);
		confidence.push(0.15);
	}

	// "staying until sunset", "staying until dusk"
	const lower = text.toLowerCase();
	if (lower.includes('staying until') && (lower.includes('sunset') || lower.includes('dusk'))) {
		times.endTime = '20:00';
		confidence.push(0.1);
	}

	// "running late", "going until we fall asleep"
	if ((lower.includes('running late') || lower.includes('going until we')) && !times.endTime) {
		times.endTime = '23:00';
		confidence.push(0.1);
	}

	// "until midnight"
	const untilMidnightMatch = text.match(/until\s+midnight/i);
	if (untilMidnightMatch && !times.endTime) {
		times.endTime = '00:00';
		confidence.push(0.1);
	}

	// Duration: "for 2 hours", "for 15 minutes", "for about 15 min"
	const hourDurMatch = text.match(/for\s+(?:about\s+)?(\d+)\s+(hours?|hrs?|hr)\b/i);
	const minDurMatch = text.match(/for\s+(?:about\s+)?(\d+)\s+(minutes?|mins?|min)\b/i);

	if (times.startTime && !times.endTime) {
		const start = DateTime.fromFormat(times.startTime, 'HH:mm');
		if (minDurMatch) {
			const minutes = parseInt(minDurMatch[1]);
			times.endTime = start.plus({ minutes }).toFormat('HH:mm');
			confidence.push(0.1);
		} else if (hourDurMatch) {
			const hours = parseInt(hourDurMatch[1]);
			times.endTime = start.plus({ hours }).toFormat('HH:mm');
			confidence.push(0.1);
		}
	}

	// Also check standalone "about X min/hr" (without "for")
	if (times.startTime && !times.endTime) {
		const aboutDurMatch = text.match(/about\s+(\d+)\s+(minutes?|mins?|min|hours?|hrs?|hr)\b/i);
		if (aboutDurMatch) {
			const start = DateTime.fromFormat(times.startTime, 'HH:mm');
			const amount = parseInt(aboutDurMatch[1]);
			if (aboutDurMatch[2].toLowerCase().startsWith('h')) {
				times.endTime = start.plus({ hours: amount }).toFormat('HH:mm');
			} else {
				times.endTime = start.plus({ minutes: amount }).toFormat('HH:mm');
			}
			confidence.push(0.1);
		}
	}

	// "lasting for X minutes/hours" or "lasting about X minutes"
	const lastingMatch = text.match(
		/lasting\s+(?:for\s+)?(?:about\s+)?(\d+)\s+(minutes?|mins?|min|hours?|hrs?|hr)\b/i
	);
	if (lastingMatch && times.startTime && !times.endTime) {
		const start = DateTime.fromFormat(times.startTime, 'HH:mm');
		const amount = parseInt(lastingMatch[1]);
		if (lastingMatch[2].toLowerCase().startsWith('h')) {
			times.endTime = start.plus({ hours: amount }).toFormat('HH:mm');
		} else {
			times.endTime = start.plus({ minutes: amount }).toFormat('HH:mm');
		}
		confidence.push(0.1);
	}

	// "closing at 6 PM", "ending at 4 PM"
	const closeMatch = text.match(/(?:closing|ending)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i);
	if (closeMatch && !times.endTime) {
		let hour = parseInt(closeMatch[1]);
		const period = closeMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		times.endTime = normalizeTime(hour);
		confidence.push(0.15);
	}

	// "opening at 11 AM"
	const openMatch = text.match(/opening\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?/i);
	if (openMatch && !times.foundTime) {
		let hour = parseInt(openMatch[1]);
		const period = openMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		times.startTime = normalizeTime(hour);
		times.foundTime = true;
		confidence.push(0.15);
	}

	// "ends at 9 PM", "ends at around 8 PM", "finishing at 10 PM" → end time
	const endsAtMatch = text.match(
		/(?:ends?|finishing)\s+(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)/i
	);
	if (endsAtMatch && !times.endTime) {
		let hour = parseInt(endsAtMatch[1]);
		const minute = endsAtMatch[2] ? parseInt(endsAtMatch[2]) : 0;
		const ampm = endsAtMatch[3].toLowerCase();
		if (ampm === 'pm' && hour < 12) hour += 12;
		if (ampm === 'am' && hour === 12) hour = 0;
		times.endTime = normalizeTime(hour, minute);
		confidence.push(0.2);
	}

	// "till 5 PM", "till 18:00", "until 9 PM" → end time
	const tillMatch = text.match(/\b(?:till|until)\s+(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)/i);
	if (tillMatch && !times.endTime) {
		let hour = parseInt(tillMatch[1]);
		const minute = tillMatch[2] ? parseInt(tillMatch[2]) : 0;
		const ampm = tillMatch[3].toLowerCase();
		if (ampm === 'pm' && hour < 12) hour += 12;
		if (ampm === 'am' && hour === 12) hour = 0;
		times.endTime = normalizeTime(hour, minute);
		confidence.push(0.2);
		stripSpans.push(tillMatch[0]);
	}

	// "returning by 2 PM", "back by 6 PM" → end time
	const returnByMatch = text.match(/(?:returning|back)\s+by\s+(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)/i);
	if (returnByMatch && !times.endTime) {
		let hour = parseInt(returnByMatch[1]);
		const minute = returnByMatch[2] ? parseInt(returnByMatch[2]) : 0;
		const ampm = returnByMatch[3].toLowerCase();
		if (ampm === 'pm' && hour < 12) hour += 12;
		if (ampm === 'am' && hour === 12) hour = 0;
		times.endTime = normalizeTime(hour, minute);
		confidence.push(0.2);
	}

	return confidence;
}
