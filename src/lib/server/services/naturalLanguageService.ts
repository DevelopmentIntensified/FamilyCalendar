import { DateTime } from 'luxon';
import nlp from 'compromise';

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
}

export interface ParseResult {
	parsed: Partial<ParsedEvent>;
	confidence: number;
}

const MONTH_MAP: Record<string, number> = {
	january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
	july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
	// Common abbreviations
	jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
	sept: 9, sep: 9, oct: 10, nov: 11, dec: 12
};

// Longest-first so "september" wins over "sep", "june" over "jun", etc.
const MONTH_ALT = 'january|february|september|december|november|october|august|april|march|june|july|may|sept|jan|feb|mar|apr|aug|sep|oct|nov|dec';

const DAY_MAP: Record<string, number> = {
	sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
	thursday: 4, friday: 5, saturday: 6
};

const ORDINAL_WORD_MAP: Record<string, number> = {
	first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
	eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19,
	twentieth: 20, 'twenty-first': 21, 'twenty first': 21, 'twenty-second': 22, 'twenty second': 22, 'twenty-third': 23, 'twenty third': 23,
	twentyfourth: 24, 'twenty-fourth': 24, 'twenty fourth': 24, 'twenty-fifth': 25, 'twenty fifth': 25, 'twenty-sixth': 26, 'twenty sixth': 26,
	'twenty-seventh': 27, 'twenty seventh': 27, 'twenty-eighth': 28, 'twenty eighth': 28, 'twenty-ninth': 29, 'twenty ninth': 29,
	thirtieth: 30, 'thirty-first': 31, 'thirty first': 31
};

const ORDINAL_WORDS_PATTERN = '(?:twenty-(?:first|second|third|fifth|sixth|seventh|eighth|ninth)|thirty-first|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twentyfourth|twentyfifth|twentysixth|twentyseventh|twentyeighth|twentyninth|thirtieth|thirtyfirst)';

function normalizeTime(hour: number, minute: number = 0): string {
	return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function applyPeriod(hour: number, period?: string): number {
	const p = period?.toLowerCase();
	if (p === 'pm' && hour < 12) return hour + 12;
	if (p === 'am' && hour === 12) return 0;
	return hour;
}

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

export function parseEventInput(input: string, zone?: string): ParseResult {
	const result: Partial<ParsedEvent> = { allDay: false };
	let confidence = 0;
	const now = zone ? DateTime.now().setZone(zone) : DateTime.now();
	const doc = nlp(input);
	const lower = input.toLowerCase();

	// ===== DATE PATTERNS =====
	
	// "this Friday", "this Saturday"
	const thisDayMatch = input.match(/\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
	if (thisDayMatch) {
		result.date = getNextDayOfWeek(thisDayMatch[1]).toFormat('yyyy-MM-dd');
		confidence += 0.25;
	}

	// "next Wednesday", "next Tuesday"
	const nextDayMatch = input.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
	if (nextDayMatch && !result.date) {
		result.date = getNextDayOfWeek(nextDayMatch[1]).plus({ weeks: 1 }).toFormat('yyyy-MM-dd');
		confidence += 0.25;
	}

	// "tomorrow"
	const tomorrowMatch = input.match(/\btomorrow\b/i);
	if (tomorrowMatch && !result.date) {
		result.date = now.plus({ days: 1 }).toFormat('yyyy-MM-dd');
		confidence += 0.2;
	}

	// "in 3 days", "in 2 weeks", "in a month"
	const relativeMatch = input.match(/\bin\s+(a|\d+)\s+(day|week|month)s?\b/i);
	if (relativeMatch && !result.date) {
		const n = relativeMatch[1].toLowerCase() === 'a' ? 1 : parseInt(relativeMatch[1]);
		result.date = now.plus({ [`${relativeMatch[2].toLowerCase()}s`]: n } as any).toFormat('yyyy-MM-dd');
		confidence += 0.25;
	}

	// "this weekend", "weekend" -> the upcoming Saturday
	const weekendMatch = input.match(/\b(?:this\s+|next\s+)?weekend\b/i);
	if (weekendMatch && !result.date) {
		let daysUntilSat = (6 - (now.weekday % 7) + 7) % 7;
		if (daysUntilSat === 0) daysUntilSat = 7;
		result.date = now.plus({ days: daysUntilSat }).toFormat('yyyy-MM-dd');
		confidence += 0.2;
	}

	// "next <month>" - "next May", "next September" — always next year
	const nextMonthMatch = input.match(new RegExp(`\\bnext\\s+(${MONTH_ALT})\\b`, 'i'));
	if (nextMonthMatch && !result.date) {
		const month = MONTH_MAP[nextMonthMatch[1].toLowerCase()];
		result.date = DateTime.fromObject({ year: now.year + 1, month, day: 1 }).toFormat('yyyy-MM-dd');
		confidence += 0.2;
	}

	// "returning this Sunday", "returning by Saturday"
	const returnDayMatch = input.match(/returning\s+(?:by\s+)?(?:this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+(morning|afternoon|evening|noon))?/i);
	if (returnDayMatch && !result.date) {
		result.date = getNextDayOfWeek(returnDayMatch[1]).toFormat('yyyy-MM-dd');
		if (returnDayMatch[2]) {
			const timeMap: Record<string, string> = { morning: '09:00', afternoon: '14:00', evening: '18:00', noon: '12:00' };
			result.endTime = timeMap[returnDayMatch[2].toLowerCase()] || '18:00';
		}
		confidence += 0.2;
	}

	// Month and day: "July 12th", "Aug 30", "Sept 5", "Dec 25, 2026"
	const monthDayMatch = input.match(new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`, 'i'));
	if (monthDayMatch && !result.date) {
		const month = MONTH_MAP[monthDayMatch[1].toLowerCase()];
		const day = parseInt(monthDayMatch[2]);
		let year: number;
		if (monthDayMatch[3]) {
			year = parseInt(monthDayMatch[3]);
		} else {
			year = now.year;
			if (DateTime.fromObject({ year, month, day }) < now && month <= now.month) year += 1;
		}
		result.date = DateTime.fromObject({ year, month, day }).toFormat('yyyy-MM-dd');
		confidence += 0.3;
	}

	// Day-first with optional year: "21 Mar 2027", "12 August"
	const dayFirstMatch = input.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?(?:,?\\s*(20\\d{2}))?\\b`, 'i'));
	if (dayFirstMatch && !result.date) {
		const day = parseInt(dayFirstMatch[1]);
		const month = MONTH_MAP[dayFirstMatch[2].toLowerCase()];
		if (day >= 1 && day <= 31) {
			let year: number;
			if (dayFirstMatch[3]) {
				year = parseInt(dayFirstMatch[3]);
			} else {
				year = now.year;
				if (DateTime.fromObject({ year, month, day }) < now && month <= now.month) year += 1;
			}
			result.date = DateTime.fromObject({ year, month, day }).toFormat('yyyy-MM-dd');
			confidence += 0.3;
		}
	}

	// ISO date: "2026-08-30"
	const isoDateMatch = input.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
	if (isoDateMatch && !result.date) {
		result.date = `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
		confidence += 0.35;
	}

	// Ordinal-first: "3rd of May", "third of June", "twenty-first of December"
	const ordinalFirstMatch = input.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)\\s+of\\s+(january|february|march|april|may|june|july|august|september|october|november|december)\\b`, 'i'));
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
	const ordinalWordMatch = input.match(new RegExp(`\\b(${ORDINAL_WORDS_PATTERN})\\s+of\\s+(january|february|march|april|may|june|july|august|september|october|november|december)\\b`, 'i'));
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

	// Numeric date: "05/03", "12/25" (MM/DD format)
	const numericDateMatch = input.match(/\b(\d{1,2})\/(\d{1,2})\b/);
	if (numericDateMatch && !result.date) {
		const month = parseInt(numericDateMatch[1]);
		const day = parseInt(numericDateMatch[2]);
		let year = now.year;
		const target = DateTime.fromObject({ year, month, day });
		if (target < now) year = now.year + 1;
		result.date = DateTime.fromObject({ year, month, day }).toFormat('yyyy-MM-dd');
		confidence += 0.3;
	}

	// ===== TIME PATTERNS =====
	let foundTime = false;

	// "6:00PM - 8:00PM" (time range with hyphen) — must check BEFORE standalone time
	const hyphenRangeMatch = input.match(/(\d{1,2}):(\d{2})\s*(am?|pm?)\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(am?|pm?)/i);
	if (hyphenRangeMatch) {
		let startHour = parseInt(hyphenRangeMatch[1]);
		let startMin = parseInt(hyphenRangeMatch[2]);
		let endHour = parseInt(hyphenRangeMatch[4]);
		let endMin = parseInt(hyphenRangeMatch[5]);
		const startPeriod = hyphenRangeMatch[3]?.toLowerCase();
		const endPeriod = hyphenRangeMatch[6]?.toLowerCase();
		if (startPeriod === 'pm' && startHour < 12) startHour += 12;
		if (startPeriod === 'am' && startHour === 12) startHour = 0;
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

	// Try compromise places
	const places = doc.places().out('array');
	if (places.length > 0) {
		result.location = places[0];
		confidence += 0.15;
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

	// ===== ATTENDANT PATTERNS =====

	// Remove already-detected location from text so compromise doesn't treat it as a person
	let attendantText = input;
	if (result.location) {
		attendantText = input.replace(new RegExp(result.location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
	}
	const attendantDoc = nlp(attendantText);

	// Try compromise people (on text with location removed)
	const people = attendantDoc.people().out('array');
	if (people.length > 0) {
		// Filter out short tokens (<=2 chars) which are likely locations/abbreviations, not people
		const filteredPeople = people.filter((p: string) => p.length > 2);
		if (filteredPeople.length > 0) {
			result.attendants = filteredPeople;
			confidence += 0.15;
		}
	}

	// "with X"
	const withMatch = input.match(/with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
	if (withMatch && (!result.attendants || result.attendants.length === 0)) {
		result.attendants = withMatch.map(m => m.replace(/^with\s+/i, '').trim());
		confidence += 0.15;
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
