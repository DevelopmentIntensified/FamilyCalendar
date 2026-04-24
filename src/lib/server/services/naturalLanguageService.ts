import { DateTime } from 'luxon';

export interface ParsedEvent {
	title: string;
	date: string;
	startTime?: string;
	endTime?: string;
	location?: string;
	description?: string;
	allDay: boolean;
	recurring?: string;
}

interface ParseResult {
	parsed: Partial<ParsedEvent>;
	confidence: number;
}

const DAY_PATTERNS: Record<string, string> = {
	sunday: '0',
	monday: '1',
	tuesday: '2',
	wednesday: '3',
	thursday: '4',
	friday: '5',
	saturday: '6',
	today: 'today',
	tomorrow: 'tomorrow'
};

const TIME_WORDS: Record<string, number> = {
	'midnight': 0,
	'noon': 12,
	'morning': 9,
	'afternoon': 14,
	'evening': 18,
	'am': 0,
	'pm': 12
};

const MONTH_MAP: Record<string, number> = {
	january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
	july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

export function parseEventInput(input: string): ParseResult {
	const result: Partial<ParsedEvent> = { allDay: false };
	let confidence = 0;
	const now = DateTime.now();
	const lower = input.toLowerCase().trim();

	// 1. Extract time patterns (e.g., "2pm", "14:30", "at noon")
	const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
	const atMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
	const morningMatch = lower.match(/\bmorning\b/);
	const afternoonMatch = lower.match(/\bafternoon\b/);
	const eveningMatch = lower.match(/\bevening\b/);
	const noonMatch = lower.match(/\bnoon\b/);
	const midnightMatch = lower.match(/\bmidnight\b/);

	let hour: number | undefined;
	let minute = 0;

	if (timeMatch || atMatch) {
		const match = atMatch || timeMatch;
		hour = parseInt(match[1]);
		if (match[2]) minute = parseInt(match[2]);
		const period = match[3];
		if (period === 'pm' && hour < 12) hour += 12;
		if (period === 'am' && hour === 12) hour = 0;
		confidence += 0.3;
	} else if (noonMatch) {
		hour = 12;
		confidence += 0.3;
	} else if (midnightMatch) {
		hour = 0;
		confidence += 0.2;
	} else if (morningMatch) {
		hour = 9;
		confidence += 0.15;
	} else if (afternoonMatch) {
		hour = 14;
		confidence += 0.15;
	} else if (eveningMatch) {
		hour = 18;
		confidence += 0.15;
	}

	if (hour !== undefined) {
		result.startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
		result.allDay = false;
	}

	// 2. Extract date patterns
	const todayMatch = lower.match(/\btoday\b/);
	const tomorrowMatch = lower.match(/\btomorrow\b/);
	const dayMatch = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
	const dateMatch = lower.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
	const monthDayMatch = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/i);

	if (todayMatch) {
		result.date = now.toFormat('yyyy-MM-dd');
		confidence += 0.2;
	} else if (tomorrowMatch) {
		result.date = now.plus({ days: 1 }).toFormat('yyyy-MM-dd');
		confidence += 0.2;
	} else if (dayMatch) {
		const targetDay = DAY_PATTERNS[dayMatch[1].toLowerCase()];
		const currentDay = now.weekday;
		let daysUntil = parseInt(targetDay) - currentDay;
		if (daysUntil <= 0) daysUntil += 7;
		result.date = now.plus({ days: daysUntil }).toFormat('yyyy-MM-dd');
		confidence += 0.25;
	} else if (monthDayMatch) {
		const month = MONTH_MAP[monthDayMatch[1].toLowerCase()];
		const day = parseInt(monthDayMatch[2]);
		result.date = DateTime.now().set({ month, day }).toFormat('yyyy-MM-dd');
		if (result.date < now.toFormat('yyyy-MM-dd')) {
			result.date = DateTime.now().plus({ years: 1 }).set({ month, day }).toFormat('yyyy-MM-dd');
		}
		confidence += 0.3;
	} else if (dateMatch) {
		const month = parseInt(dateMatch[1]);
		const day = parseInt(dateMatch[2]);
		result.date = DateTime.now().set({ month, day }).toFormat('yyyy-MM-dd');
		confidence += 0.2;
	}

	// 3. Check for all-day events
	const allDayPatterns = ['all day', 'all-day', 'whole day', 'birthday', 'holiday', 'convention'];
	if (allDayPatterns.some(p => lower.includes(p)) {
		result.allDay = true;
		confidence += 0.15;
	}

	// 4. Extract location (after "at", "in", "location:")
	const locationMatch = lower.match(/(?:at|in)\s+([a-z\s]+?)(?:\s+at|\s+for|$)/);
	if (locationMatch) {
		result.location = locationMatch[1].trim();
		confidence += 0.1;
	}

	// 5. Extract duration
	const durationMatch = lower.match(/for\s+(\d+)\s*(min|minute|minutes|hour|hours|hr|hrs)/);
	if (durationMatch) {
		const num = parseInt(durationMatch[1]);
		const unit = durationMatch[2];
		if (unit.startsWith('min')) {
			result.endTime = DateTime.fromISO(`2024-01-01T${result.startTime}`).plus({ minutes: num }).toFormat('HH:mm');
		} else {
			result.endTime = DateTime.fromISO(`2024-01-01T${result.startTime}`).plus({ hours: num }).toFormat('HH:mm');
		}
		confidence += 0.1;
	}

	// 6. Check for recurring events
	const recurringMatch = lower.match(/\bevery\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|week|month)\b/i);
	if (recurringMatch) {
		result.recurring = recurringMatch[1];
		confidence += 0.1;
	}

	// 7. Extract title (what's left after removing patterns)
	let title = lower
		.replace(/\b(at|in|on|for|to)\s+\d+/g, '')
		.replace(/\b\d{1,2}:\d{2}\s*(am|pm)?/g, '')
		.replace(/\b(am|pm)\b/g, '')
		.replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g, '')
		.replace(/\b(today|tomorrow)\b/g, '')
		.replace(/\d{1,2}\s*\/\s*\d{1,2}/g, '')
		.replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/gi, '')
		.replace(/\ball day\b/g, '')
		.replace(/\ball-day\b/g, '')
		.replace(/\bwhole day\b/g, '')
		.replace(/\bfor\s+\d+\s*(min|minute|minutes|hour|hours|hr|hrs)\b/g, '')
		.replace(/\bevery\s+\w+\b/g, '')
		.trim();

	if (title.length > 0 && !title.match(/^\s*$/)) {
		result.title = title.charAt(0).toUpperCase() + title.slice(1);
		confidence += 0.2;
	}

	// 8. If no date found, default to today
	if (!result.date) {
		result.date = now.toFormat('yyyy-MM-dd');
	}

	// 9. If no title, use the whole input
	if (!result.title) {
		result.title = input;
		confidence = 0.5;
	}

	return { parsed: result, confidence: Math.min(confidence, 1) };
}