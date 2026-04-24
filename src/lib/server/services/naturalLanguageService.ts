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

function normalizeTime(hour: number, minute: number = 0): string {
	return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function parseDayOfWeek(day: string): number | null {
	const map: Record<string, number> = {
		sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
		thursday: 4, friday: 5, saturday: 6
	};
	return map[day.toLowerCase()] ?? null;
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

	// 0. Handle relative dates first
	// "this Friday", "this Saturday"
	const thisDayMatch = input.match(/\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
	if (thisDayMatch) {
		const targetDate = getNextDayOfWeek(thisDayMatch[1]);
		result.date = targetDate.toFormat('yyyy-MM-dd');
		confidence += 0.25;
	}
	
	// "next Wednesday", "next Tuesday"
	const nextDayMatch = input.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
	if (nextDayMatch && !result.date) {
		const targetDate = getNextDayOfWeek(nextDayMatch[1]).plus({ weeks: 1 });
		result.date = targetDate.toFormat('yyyy-MM-dd');
		confidence += 0.25;
	}
	
	// "early tomorrow morning", "tomorrow morning"
	const tomorrowMatch = input.match(/\btomorrow\b/i);
	if (tomorrowMatch && !result.date) {
		result.date = now.plus({ days: 1 }).toFormat('yyyy-MM-dd');
		confidence += 0.2;
	}
	
	// "early morning", "early tomorrow", "tomorrow early"
	const earlyTomorrowMatch = input.match(/\b(?:early\s+)?tomorrow(?:\s+morning)?\b/i);
	if (earlyTomorrowMatch && !result.startTime && !foundTime) {
		result.startTime = '06:00';
		confidence += 0.15;
	}
	
	// "next month" - e.g., "next May"
	const nextMonthMatch = input.match(/\bnext\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
	if (nextMonthMatch && !result.date) {
		const month = MONTH_MAP[nextMonthMatch[1].toLowerCase()];
		let year = now.month > month ? now.year + 1 : now.year;
		result.date = DateTime.fromObject({ year, month, day: 1 }).toFormat('yyyy-MM-dd');
		confidence += 0.2;
	}
	
	// 1. Extract date using compromise + manual patterns
	let foundDate = !!result.date;
	
	// Try compromise date plugin
	const dates = doc.dates().out('array');
	if (dates.length > 0 && !foundDate) {
		const dateStr = dates[0].toLowerCase();
		
		// Handle "this Saturday", "this Friday" etc
		const thisMatch = input.match(/this\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
		if (thisMatch) {
			const dayNum = parseDayOfWeek(thisMatch[1]);
			if (dayNum !== null) {
				const currentDay = now.weekday % 7;
				let daysUntil = dayNum - currentDay;
				if (daysUntil <= 0) daysUntil += 7;
				result.date = now.plus({ days: daysUntil }).toFormat('yyyy-MM-dd');
				foundDate = true;
				confidence += 0.25;
			}
		}
		
		// Handle month and day e.g., "July 12th", "May 4th"
		const monthDayMatch = input.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
		if (monthDayMatch) {
			const month = MONTH_MAP[monthDayMatch[1].toLowerCase()];
			const day = parseInt(monthDayMatch[2]);
			let year = now.year;
			const target = DateTime.fromObject({ year, month, day });
			if (target < now && month <= now.month) {
				year = now.year + 1;
			}
			result.date = DateTime.fromObject({ year, month, day }).toFormat('yyyy-MM-dd');
			foundDate = true;
			confidence += 0.3;
		}
		
		// Handle dates like "March 14th"
		const singleDateMatch = input.match(/\b(march|april|may|june|july|august|september|october|november|december|january|february)\s+(\d{1,2})\b/i);
		if (singleDateMatch && !foundDate) {
			const month = MONTH_MAP[singleDateMatch[1].toLowerCase()];
			const day = parseInt(singleDateMatch[2]);
			let year = now.year;
			const target = DateTime.fromObject({ year, month, day });
			if (target < now && month <= now.month) {
				year = now.year + 1;
			}
			result.date = DateTime.fromObject({ year, month, day }).toFormat('yyyy-MM-dd');
			foundDate = true;
			confidence += 0.25;
		}
	}
	
	// Manual date patterns
	if (!foundDate) {
		// Handle specific dates like "Friday, July 12th"
		const friMatch = input.match(/friday\s*,\s*july\s+(\d{1,2})/i);
		if (friMatch) {
			result.date = DateTime.fromObject({ year: now.year, month: 7, day: parseInt(friMatch[1]) }).toFormat('yyyy-MM-dd');
			foundDate = true;
			confidence += 0.3;
		}
		
		// Handle "the 5th of October", "October 5th"
		const ofMatch = input.match(/the\s+(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i);
		if (ofMatch && !foundDate) {
			const month = MONTH_MAP[ofMatch[2].toLowerCase()];
			const day = parseInt(ofMatch[1]);
			let year = now.year;
			const target = DateTime.fromObject({ year, month, day });
			if (target < now && month <= now.month) {
				year = now.year + 1;
			}
			result.date = DateTime.fromObject({ year, month, day }).toFormat('yyyy-MM-dd');
			foundDate = true;
			confidence += 0.25;
		}
	}
	
	// 2. Extract time using compromise + patterns
	let foundTime = false;
	
	// Check for all-day events first
	const allDayPatterns = ['all day', 'all-day', 'whole day', 'birthday'];
	if (allDayPatterns.some(p => input.toLowerCase().includes(p))) {
		result.allDay = true;
		confidence += 0.15;
	}
	
	// Handle "starting at 6 PM", "at 8 AM sharp", "beginning at 9 AM"
	const startTimeMatch = input.match(/(?:start(?:ing)?\s+at|at|beginning\s+at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?/i);
	if (startTimeMatch) {
		let hour = parseInt(startTimeMatch[1]);
		const minute = startTimeMatch[2] ? parseInt(startTimeMatch[2]) : 0;
		const period = startTimeMatch[3]?.toLowerCase();
		
		if (period === 'pm' && hour < 12) hour += 12;
		if (period === 'am' && hour === 12) hour = 0;
		if (!period && hour < 8) hour += 12; // assume PM for times like 6 PM
		
		result.startTime = normalizeTime(hour, minute);
		foundTime = true;
		confidence += 0.25;
	}
	
	// Handle "sharp at 8 AM"
	const sharpMatch = input.match(/(\d{1,2})\s*(?:am|pm)\s*sharp/i);
	if (sharpMatch && !foundTime) {
		let hour = parseInt(sharpMatch[1]);
		const ampmMatch = input.match(/(\d{1,2})\s*(am|pm)\s*sharp/i);
		if (ampmMatch) {
			if (ampmMatch[2].toLowerCase() === 'pm' && hour < 12) hour += 12;
			result.startTime = normalizeTime(hour);
			foundTime = true;
			confidence += 0.2;
		}
	}
	
	// 3. Extract end time / duration
	// Handle "wrapping up around 9 PM", "concludes at 5 PM", "finishes by noon"
	const endTimeMatch = input.match(/(?:wrapping up|concludes?|finishes?|ending|ending|concluding)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (endTimeMatch) {
		let hour = parseInt(endTimeMatch[1]);
		const minute = endTimeMatch[2] ? parseInt(endTimeMatch[2]) : 0;
		const period = endTimeMatch[3]?.toLowerCase();
		
		if (period === 'pm' && hour < 12) hour += 12;
		if (period === 'am' && hour === 12) hour = 0;
		
		result.endTime = normalizeTime(hour, minute);
		confidence += 0.15;
	}
	
	// Handle duration like "from 9 AM to 5 PM"
	const fromToMatch = input.match(/from\s+(\d{1,2})\s*(?:am|pm)?\s+to\s+(\d{1,2})\s*(am|pm)?/i);
	if (fromToMatch && !result.endTime) {
		let startHour = parseInt(fromToMatch[1]);
		let endHour = parseInt(fromToMatch[2]);
		const period = fromToMatch[3];
		
		if (period?.toLowerCase() === 'pm') {
			if (startHour < 12) startHour += 12;
			if (endHour < 12) endHour += 12;
		}
		
		result.startTime = normalizeTime(startHour);
		result.endTime = normalizeTime(endHour);
		foundTime = true;
		confidence += 0.2;
	}
	
	// Handle duration expressed as hours
	const hourDurMatch = input.match(/for\s+(?:approximately\s+)?(\d+)\s+(hours?)/i);
	if (hourDurMatch && result.startTime) {
		const hours = parseInt(hourDurMatch[1]);
		const start = DateTime.fromFormat(result.startTime, 'HH:mm');
		result.endTime = start.plus({ hours }).toFormat('HH:mm');
		confidence += 0.1;
	}
	
	// Handle "until noon", "until 4 PM"
	const untilMatch = input.match(/until\s+(noon|midnight|(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)/i);
	if (untilMatch && !result.endTime) {
		if (untilMatch[1] === 'noon') {
			result.endTime = '12:00';
		} else if (untilMatch[1] === 'midnight') {
			result.endTime = '00:00';
		} else if (untilMatch[2]) {
			let hour = parseInt(untilMatch[2]);
			const minute = untilMatch[3] ? parseInt(untilMatch[3]) : 0;
			const period = untilMatch[4]?.toLowerCase();
			if (period === 'pm' && hour < 12) hour += 12;
			result.endTime = normalizeTime(hour, minute);
		}
		confidence += 0.1;
	}
	
	// Handle "leaving at 6 AM", "departing at 5 AM"
	const leaveMatch = input.match(/(?:leaving|departing)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
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
	
	// Handle "returning by 2 PM", "arriving by 1 PM", "wrapping up around 9 PM"
	const returnMatch = input.match(/(?:returning|arriving|wrapping\s+up)\s+(?:by\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (returnMatch && !result.endTime) {
		let hour = parseInt(returnMatch[1]);
		const minute = returnMatch[2] ? parseInt(returnMatch[2]) : 0;
		const period = returnMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		if (period === 'am' && hour === 12) hour = 0;
		result.endTime = normalizeTime(hour, minute);
		confidence += 0.15;
	}
	
	// Handle "kicking off at 6 PM", "going on until late evening" (estimate)
	const kickOffMatch = input.match(/kicking\s+off\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (kickOffMatch && !foundTime) {
		let hour = parseInt(kickOffMatch[1]);
		const period = kickOffMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.startTime = normalizeTime(hour);
		foundTime = true;
		confidence += 0.2;
	}
	
	// Handle "goes on until", "continuing until"
	const continuesMatch = input.match(/(?:goes\s+on|continuing)\s+until\s+(?:around\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (continuesMatch && !result.endTime) {
		let hour = parseInt(continuesMatch[1]);
		const period = continuesMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.endTime = normalizeTime(hour);
		confidence += 0.15;
	}
	
	// Handle "for about 15 minutes" - short duration
	const shortDurMatch = input.match(/for\s+(?:about\s+)?(\d+)\s+(minutes?|mins?)\b/i);
	if (shortDurMatch && result.startTime) {
		const minutes = parseInt(shortDurMatch[1]);
		const start = DateTime.fromFormat(result.startTime, 'HH:mm');
		result.endTime = start.plus({ minutes }).toFormat('HH:mm');
		confidence += 0.1;
	}
	
	// Handle "beginning at dusk around 8 PM" - approximate evening time
	const duskMatch = input.match(/beginning\s+at\s+dusk\s+around\s+(\d{1,2})\s*(am|pm)?/i);
	if (duskMatch && !foundTime) {
		let hour = parseInt(duskMatch[1]);
		const period = duskMatch[2]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.startTime = normalizeTime(hour);
		foundTime = true;
		confidence += 0.15;
	}
	
	// Handle "until the film concludes around 10 PM"
	const concludesMatch = input.match(/until\s+(?:the\s+film\s+)?concludes?\s+(?:around\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
	if (concludesMatch && !result.endTime) {
		let hour = parseInt(concludesMatch[1]);
		const period = concludesMatch[3]?.toLowerCase();
		if (period === 'pm' && hour < 12) hour += 12;
		result.endTime = normalizeTime(hour);
		confidence += 0.15;
	}
	
	// 4. Extract location
	const places = doc.places().out('array');
	if (places.length > 0) {
		result.location = places[0];
		confidence += 0.15;
	}
	
	// Manual location patterns - "at the X"
	const atLocMatch = input.match(/at\s+the\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
	if (atLocMatch && !result.location) {
		result.location = atLocMatch[1];
		confidence += 0.15;
	}
	
	// "at my apartment", "at my backyard", "at my driveway"
	const myPlaceMatch = input.match(/at\s+(?:my|our)\s+([a-z]+)/i);
	if (myPlaceMatch && !result.location) {
		result.location = myPlaceMatch[1].charAt(0).toUpperCase() + myPlaceMatch[1].slice(1);
		confidence += 0.1;
	}
	
	// Address pattern - "at 450 Main Street"
	const addressMatch = input.match(/at\s+(\d+\s+[A-Za-z]+\s+[A-Za-z]+)/);
	if (addressMatch && !result.location) {
		result.location = addressMatch[1];
		confidence += 0.15;
	}
	
	// "at the [place] Studio", "at the [place] Theater"
	const venueMatch = input.match(/at\s+the\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:Studio|Theatre|Center|Hub|Museum|Park|Clubhouse|Library|Yoga|Shelter))/i);
	if (venueMatch && !result.location) {
		result.location = venueMatch[1];
		confidence += 0.15;
	}
	
	// 5. Extract attendants (people)
	const people = doc.people().out('array');
	if (people.length > 0) {
		result.attendants = people;
		confidence += 0.15;
	}
	
	// Manual "with" pattern for names
	const withMatch = input.match(/with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
	if (withMatch && (!result.attendants || result.attendants.length === 0)) {
		const names = withMatch.map(m => m.replace(/^with\s+/i, '').trim());
		result.attendants = names;
		confidence += 0.15;
	}
	
	// Handle audience/groups - "designed for X" or "welcome to X" or "are invited" or "are coming" or "will be there"
	const audiencePatterns = [
		/(?:designed\s+for|welcome\s+(?:to\s+)?|including|for)\s+([^\.]+?)(?:\s+looking|\s+to\s+|\s+who|\s+and\s+|$)/gi,
		/(?:are\s+invited|are\s+coming|will\s+be\s+(?:there|performing|walking|cleaning|browsing|involved|attending|participating))\s+([^\.]+?)(?:\s+(?:and|to|for|$))/gi,
		/(?:expecting?|a\s+crowd\s+of)\s+([^\.]+?)(?:\s+(?:who|to|$))/gi,
		/(?:the\s+(?:whole|regular)\s+)?(\w+\s+department|group|team|friends|members|students|volunteers|residents|neighbors|participants)\b(?!s?\s+are)/gi
	];
	
	if ((!result.attendants || result.attendants.length === 0) && audiencePatterns.length > 0) {
		for (const pattern of audiencePatterns) {
			const match = input.match(pattern);
			if (match && match[1] && match[1].length > 2 && match[1].length < 60) {
				result.attendants = [match[1].trim()];
				confidence += 0.1;
				break;
			}
		}
	}
	
	// Multi-day event
	const multiDayMatch = input.match(/from\s+\d{1,2}\s+(?:am|pm)?\s+on\s+\w+\s+through\s+(\w+)\s+(\d{1,2})/i);
	if (multiDayMatch) {
		result.recurring = 'multi-day';
		confidence += 0.15;
	}
	
	// 6. Extract title (clean up the rest)
	let title = input
		.replace(/\d{1,2}:\d{2}\s*(am|pm)?/gi, '')
		.replace(/\bat\s+\d+/g, '')
		.replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?/gi, '')
		.replace(/\b(the\s+)?\d{1,2}(?:st|nd|rd|th)?\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)/gi, '')
		.replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
		.replace(/\ball[- ]?day\b/gi, '')
		.replace(/\bfrom\s+\d{1,2}\s*(?:am|pm)?\s+to\s+\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bbeginning\s+at\s+\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bstarting\s+at\s+\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bwrapping\s+up\s+(?:around\s+)?\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bconcludes?\s+(?:at\s+)?\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bfinishes?\s+(?:by\s+)?\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\buntil\s+(?:around\s+)?\d{1,2}\s*(?:am|pm)?/gi, '')
		.replace(/\bfor\s+\d+\s+(hour|minute)s?/gi, '')
		.replace(/\bat\s+the\s+[A-Z][a-z]+/g, '')
		.replace(/\bat\s+\d+\s+[A-Za-z]+\s+[A-Za-z]+/g, '')
		.replace(/\bthe\s+\d+\s+(?:st|nd|rd|th)\b/gi, '')
		.replace(/\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
		.replace(/,\s*$/, '')
		.trim();
	
	if (title.length > 3 && !title.match(/^[\s,]*$/)) {
		result.title = title.replace(/^[,\s]+|[,\s]+$/g, '');
		confidence += 0.2;
	}
	
	// 7. Default to today if no date
	if (!result.date) {
		result.date = now.toFormat('yyyy-MM-dd');
	}
	
	// 8. Default start time if all-day
	if (result.allDay && !result.startTime) {
		result.startTime = '09:00';
		result.endTime = '17:00';
	}
	
	return { parsed: result, confidence: Math.min(confidence, 1) };
}