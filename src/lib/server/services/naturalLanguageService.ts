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

interface ParseResult {
	parsed: Partial<ParsedEvent>;
	confidence: number;
}

const MONTH_MAP: Record<string, number> = {
	january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
	july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

const DAY_MAP: Record<string, number> = {
	sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
	thursday: 4, friday: 5, saturday: 6
};

function normalizeTime(hour: number, minute: number = 0): string {
	return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function parseDayOfWeek(day: string): number | null {
	return DAY_MAP[day.toLowerCase()] ?? null;
}

function getNextDayOfWeek(day: string): DateTime {
	const dayNum = parseDayOfWeek(day);
	if (dayNum === null) return DateTime.now();
	const now = DateTime.now();
	const currentDay = now.weekday % 7;
	let daysUntil = dayNum - currentDay;
	if (daysUntil <= 0) daysUntil += 7;
	return now.plus({ days: daysUntil });
}

export function parseEventInput(input: string): ParseResult {
	const result: Partial<ParsedEvent> = { allDay: false };
	let confidence = 0;
	const now = DateTime.now();
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

	// "next month" - "next May", "next July"
	const nextMonthMatch = input.match(/\bnext\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
	if (nextMonthMatch && !result.date) {
		const month = MONTH_MAP[nextMonthMatch[1].toLowerCase()];
		let year = now.month >= month ? now.year + 1 : now.year;
		result.date = DateTime.fromObject({ year, month, day: 1 }).toFormat('yyyy-MM-dd');
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

	// Month and day: "July 12th", "May 4th", "October 5th"
	const monthDayMatch = input.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
	if (monthDayMatch && !result.date) {
		const month = MONTH_MAP[monthDayMatch[1].toLowerCase()];
		const day = parseInt(monthDayMatch[2]);
		let year = now.year;
		const target = DateTime.fromObject({ year, month, day });
		if (target < now && month <= now.month) year = now.year + 1;
		result.date = DateTime.fromObject({ year, month, day }).toFormat('yyyy-MM-dd');
		confidence += 0.3;
	}

	// ===== TIME PATTERNS =====
	let foundTime = false;

	// Check all-day first
	if (['all day', 'all-day', 'whole day', 'birthday'].some(p => lower.includes(p))) {
		result.allDay = true;
		confidence += 0.15;
	}

	// "starting at 6 PM", "at 8 AM", "beginning at 9 AM"
	const startTimeMatch = input.match(/(?:start(?:ing)?\s+at|at|beginning\s+at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?/i);
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

	// Time of day: "early morning", "morning", "afternoon", "evening"
	const timeOfDayMatch = input.match(/\b(early\s+morning|morning|afternoon|evening)\b/i);
	if (timeOfDayMatch && !foundTime) {
		const todMap: Record<string, string> = { 'early morning': '06:00', morning: '09:00', afternoon: '14:00', evening: '18:00' };
		result.startTime = todMap[timeOfDayMatch[1].toLowerCase()];
		foundTime = true;
		confidence += 0.15;
	}

	// "kicking off at 5 PM"
	const kickOffMatch = input.match(/kicking\s+off\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (kickOffMatch && !foundTime) {
		let hour = parseInt(kickOffMatch[1]);
		const period = kickOffMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.startTime = normalizeTime(hour);
		foundTime = true;
		confidence += 0.2;
	}

	// "departing at 5 AM", "leaving at 6 AM"
	const leaveMatch = input.match(/(?:leaving|departing)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
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
	const arriveMatch = input.match(/arriving\s+(?:at|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
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
	const fromToMatch = input.match(/from\s+(\d{1,2})(?:(?::(\d{2})))?\s*(am|pm)?\s+to\s+(\d{1,2})(?:(?::(\d{2})))?\s*(am|pm)?/i);
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
	const finishMatch = input.match(/(?:finishes?(?:\s+around\s+)?|(?:finishing|concludes?)(?:\s+at\s+)?)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (finishMatch && !result.endTime) {
		let hour = parseInt(finishMatch[1]);
		const period = finishMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.endTime = normalizeTime(hour);
		confidence += 0.15;
	}

	// "going on until 9 PM", "continuing until 9 PM"
	const continueMatch = input.match(/(?:going\s+on|continuing)\s+until\s+(?:around\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
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

	// Duration: "for 2 hours"
	const hourDurMatch = input.match(/for\s+(\d+)\s+hours?/i);
	if (hourDurMatch && result.startTime && !result.endTime) {
		const hours = parseInt(hourDurMatch[1]);
		const start = DateTime.fromFormat(result.startTime, 'HH:mm');
		result.endTime = start.plus({ hours }).toFormat('HH:mm');
		confidence += 0.1;
	}

	// "closing at 6 PM", "ending at 4 PM"
	const closeMatch = input.match(/(?:closing|ending)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (closeMatch && !result.endTime) {
		let hour = parseInt(closeMatch[1]);
		const period = closeMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.endTime = normalizeTime(hour);
		confidence += 0.15;
	}

	// "opening at 11 AM"
	const openMatch = input.match(/opening\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (openMatch && !foundTime) {
		let hour = parseInt(openMatch[1]);
		const period = openMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.startTime = normalizeTime(hour);
		foundTime = true;
		confidence += 0.15;
	}

	// ===== LOCATION PATTERNS =====
	
	// Try compromise places
	const places = doc.places().out('array');
	if (places.length > 0) {
		result.location = places[0];
		confidence += 0.15;
	}

	// "at the X"
	const atLocMatch = input.match(/at\s+the\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
	if (atLocMatch && !result.location) {
		result.location = atLocMatch[1];
		confidence += 0.15;
	}

	// "at my apartment", "at my backyard", "at home"
	const myPlaceMatch = input.match(/at\s+(?:my|our)\s+([a-z]+)|at\s+home\b/i);
	if (myPlaceMatch && !result.location) {
		result.location = myPlaceMatch[1] ? myPlaceMatch[1].charAt(0).toUpperCase() + myPlaceMatch[1].slice(1) : 'Home';
		confidence += 0.1;
	}

	// Address: "at 450 Main Street"
	const addressMatch = input.match(/at\s+(\d+\s+[A-Za-z]+\s+[A-Za-z]+)/);
	if (addressMatch && !result.location) {
		result.location = addressMatch[1];
		confidence += 0.15;
	}

	// ===== ATTENDANT PATTERNS =====

	// Try compromise people
	const people = doc.people().out('array');
	if (people.length > 0) {
		result.attendants = people;
		confidence += 0.15;
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
	let title = input
		.replace(/\d{1,2}:\d{2}\s*(am|pm)?/gi, '')
		.replace(/\bat\s+\d+/g, '')
		.replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?/gi, '')
		.replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
		.replace(/\ball[- ]?day\b/gi, '')
		.replace(/\bfrom\s+\d{1,2}\s*(?:am|pm)?\s+to\s+\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bbeginning\s+at\s+\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bstarting\s+at\s+\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bkicking\s+off\s+at\s+\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bwrapping\s+up\s+(?:around\s+)?\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bdeparting\s+at\s+\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bleaving\s+at\s+\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\barriving\s+(?:at|by)\s+\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bfor\s+\d+\s+(hour|minute)s?/gi, '')
		.replace(/\bat\s+the\s+[A-Z][a-z]+/g, '')
		.replace(/\bat\s+\d+\s+[A-Za-z]+\s+[A-Za-z]+/g, '')
		.replace(/\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
		.replace(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
		.replace(/,\s*$/, '')
		.trim();

	if (title.length > 3 && !title.match(/^[\s,]*$/)) {
		result.title = title.replace(/^[,\s]+|[,\s]+$/g, '');
		confidence += 0.2;
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