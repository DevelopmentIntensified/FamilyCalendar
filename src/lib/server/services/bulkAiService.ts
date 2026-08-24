import { chatJson } from './llm';
import { DateTime } from 'luxon';

export interface BulkEventSummary {
	id: string;
	title: string;
	start: string;
	location: string | null;
}

export interface BulkCalendarRef {
	id: string;
	name: string;
}

export interface BulkPlanOp {
	id: string;
	title?: string;
	date?: string;
	startTime?: string;
	endTime?: string;
	location?: string;
	allDay?: boolean;
	calendarId?: string;
	delete?: boolean;
}

// Longest-first so "september" wins over "sep" (same table as naturalLanguageService).
const MONTH_MAP: Record<string, number> = {
	january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
	july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
	jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
	sept: 9, sep: 9, oct: 10, nov: 11, dec: 12
};
const MONTH_ALT = 'january|february|september|december|november|october|august|april|march|june|july|may|sept|jan|feb|mar|apr|aug|sep|oct|nov|dec';

const DAY_MAP: Record<string, number> = {
	sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
	thursday: 4, friday: 5, saturday: 6
};
const DAY_ALT = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';

function normalizeTime(hour: number, minute = 0): string {
	return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function applyPeriod(hour: number, period?: string): number {
	const p = period?.toLowerCase();
	if (p === 'pm' && hour < 12) return hour + 12;
	if (p === 'am' && hour === 12) return 0;
	return hour;
}

/**
 * Resolve a date expression against `today`. Returns YYYY-MM-DD or null.
 * Patterns are ordered most-explicit first; first match wins.
 */
export function resolveBulkDate(lower: string, today: DateTime): string | null {
	// ISO date: "2026-08-28"
	const iso = lower.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
	if (iso) {
		const dt = DateTime.fromObject({ year: +iso[1], month: +iso[2], day: +iso[3] });
		if (dt.isValid) return dt.toISODate()!;
	}

	// Month-day: "aug 28", "august 28th", "sept 5, 2026"
	const monthDay = lower.match(new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`));
	if (monthDay) {
		const month = MONTH_MAP[monthDay[1]];
		const day = +monthDay[2];
		let year = monthDay[3] ? +monthDay[3] : today.year;
		if (!monthDay[3] && DateTime.fromObject({ year, month, day }) < today && month <= today.month) year += 1;
		const dt = DateTime.fromObject({ year, month, day });
		if (dt.isValid) return dt.toISODate()!;
	}

	// Day-month: "28 aug", "21st of september"
	const dayMonth = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALT})\\.?(?:,?\\s*(20\\d{2}))?\\b`));
	if (dayMonth) {
		const day = +dayMonth[1];
		const month = MONTH_MAP[dayMonth[2]];
		let year = dayMonth[3] ? +dayMonth[3] : today.year;
		if (!dayMonth[3] && DateTime.fromObject({ year, month, day }) < today && month <= today.month) year += 1;
		if (day >= 1 && day <= 31) {
			const dt = DateTime.fromObject({ year, month, day });
			if (dt.isValid) return dt.toISODate()!;
		}
	}

	// "tomorrow" / "today"
	if (/\btomorrow\b/.test(lower)) return today.plus({ days: 1 }).toISODate()!;
	if (/\btoday\b/.test(lower)) return today.toISODate()!;

	// "next week" / "next month" — same position, one unit later
	if (/\bnext week\b/.test(lower)) return today.plus({ weeks: 1 }).toISODate()!;
	if (/\bnext month\b/.test(lower)) return today.plus({ months: 1 }).toISODate()!;

	// "this weekend" / "next weekend" / "weekend" -> upcoming Saturday
	if (/\b(?:this|next)?\s*weekend\b/.test(lower)) {
		let daysUntilSat = (6 - (today.weekday % 7) + 7) % 7;
		if (daysUntilSat === 0) daysUntilSat = 7;
		return today.plus({ days: daysUntilSat }).toISODate()!;
	}

	// Weekday, optionally "next/this/on <day>": upcoming occurrence (1-7 days out)
	const dayMatch = lower.match(new RegExp(`\\b(?:next|this|on)?\\s*(${DAY_ALT})\\b`));
	if (dayMatch) {
		const target = DAY_MAP[dayMatch[1]];
		const current = today.weekday % 7;
		let daysUntil = target - current;
		if (daysUntil <= 0) daysUntil += 7;
		return today.plus({ days: daysUntil }).toISODate()!;
	}

	return null;
}

/** Resolve a time expression. Returns HH:mm or null. */
export function resolveBulkTime(lower: string): string | null {
	// "at 3pm", "3:30 pm", "15:00"
	const m = lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
	if (!m) return null;
	const hour = +m[1];
	if (hour > 23) return null;
	const minute = m[2] ? +m[2] : 0;
	if (minute > 59) return null;
	if (!m[3] && !m[2] && hour <= 7) return null; // bare small numbers ("2 selected") aren't times
	return normalizeTime(applyPeriod(hour, m[3]));
}

/** Find a calendar referenced by name ("to family", "personal calendar"). */
export function resolveBulkCalendar(
	lower: string,
	calendars: BulkCalendarRef[]
): string | null {
	for (const cal of calendars) {
		const name = cal.name.toLowerCase().trim();
		if (name && lower.includes(name)) return cal.id;
	}
	// Try name without the "calendar" suffix: "to family" matches "Family Calendar"
	for (const cal of calendars) {
		const stem = cal.name.toLowerCase().replace(/\bcalendar(s)?\b/g, '').trim();
		if (stem.length >= 3 && new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) {
			return cal.id;
		}
	}
	return null;
}

/** Events explicitly named in the instruction; empty means "all selected". */
function selectTargets(lower: string, events: BulkEventSummary[]): BulkEventSummary[] {
	const named = events.filter(
		(e) => e.title && e.title.length > 3 && lower.includes(e.title.toLowerCase())
	);
	return named;
}

/**
 * Deterministic bulk-edit planner. Parses an instruction against the
 * selected events and returns ops (same shape the AI planner produced).
 * Returns [] when nothing in the instruction is actionable — the caller
 * reports those phrases for the parsing library.
 */
export function planBulkEdits(
	instruction: string,
	events: BulkEventSummary[],
	today: string,
	calendars: BulkCalendarRef[] = []
): BulkPlanOp[] {
	const lower = instruction.toLowerCase();
	const todayDt = DateTime.fromISO(today);

	const isDelete = /\b(deletes?|removes?|cancel|trash|scrap)\b/.test(lower);
	const date = isDelete ? null : resolveBulkDate(lower, todayDt);
	const time = isDelete ? null : resolveBulkTime(lower);
	const calendarId = isDelete ? null : resolveBulkCalendar(lower, calendars);

	if (!isDelete && !date && !time && !calendarId) return [];

	// Named events only; otherwise the whole selection.
	const targets = selectTargets(lower, events);
	const affected = targets.length > 0 ? targets : events;

	return affected.map((e) => {
		if (isDelete) return { id: e.id, delete: true } as BulkPlanOp;
		const op: BulkPlanOp = { id: e.id };
		if (date) op.date = date;
		if (time) {
			op.startTime = time;
			op.endTime = DateTime.fromFormat(time, 'HH:mm').plus({ hours: 1 }).toFormat('HH:mm');
		}
		if (calendarId) op.calendarId = calendarId;
		return op;
	});
}

function isValidTime(v: string): boolean {
	const m = v.match(/^(\d{1,2}):(\d{2})$/);
	return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

function isValidId(v: string): boolean {
	return /^[A-Za-z0-9_-]{5,64}$/.test(v);
}

export function parseBulkPlan(content: string, allowedIds: string[]): BulkPlanOp[] {
	try {
		const json = JSON.parse(content);
		const rawOps = Array.isArray(json) ? json : Array.isArray(json?.ops) ? json.ops : [];
		const seen = new Set<string>();
		const ops: BulkPlanOp[] = [];
		for (const op of rawOps) {
			if (!op || typeof op.id !== 'string' || !allowedIds.includes(op.id) || seen.has(op.id)) continue;

			if (op.delete === true) {
				ops.push({ id: op.id, delete: true });
				seen.add(op.id);
				continue;
			}

			const clean: BulkPlanOp = { id: op.id };
			if (typeof op.title === 'string' && op.title.trim()) clean.title = op.title.trim();
			if (typeof op.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(op.date)) clean.date = op.date;
			if (typeof op.startTime === 'string' && isValidTime(op.startTime)) {
				clean.startTime = op.startTime.padStart(5, '0');
			}
			if (typeof op.endTime === 'string' && isValidTime(op.endTime)) {
				clean.endTime = op.endTime.padStart(5, '0');
			}
			if (typeof op.location === 'string' && op.location.trim()) clean.location = op.location.trim();
			if (typeof op.allDay === 'boolean') clean.allDay = op.allDay;
			if (typeof op.calendarId === 'string' && isValidId(op.calendarId)) {
				clean.calendarId = op.calendarId;
			}
			if (Object.keys(clean).length > 1) {
				ops.push(clean);
				seen.add(op.id);
			}
		}
		return ops;
	} catch {
		return [];
	}
}

// ===== AI fallback for instructions the local parser misses =====

const BULK_SYSTEM_PROMPT = `You edit calendar events in bulk. Given an instruction plus JSON lists of EVENTS and CALENDARS, decide which events change and how.

Return JSON: {"ops":[{"id":"<event id>","title":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","location":"...","allDay":false,"calendarId":"<calendar id>","delete":true}]}

RULES:
- Only include events that actually change; omit fields that stay the same.
- "date" moves an event (keep its time unless startTime/endTime given).
- Resolve relative dates against the provided today.
- "calendarId" may ONLY be an id from the CALENDARS list.
- "delete": true ONLY for explicit removal requests.
- Never invent ids outside the provided lists.
- Return {"ops":[]} when nothing applies.`;

export async function planBulkEditsWithAI(
	instruction: string,
	events: BulkEventSummary[],
	today: string,
	calendars: BulkCalendarRef[] = []
): Promise<BulkPlanOp[]> {
	const json = await chatJson(
		BULK_SYSTEM_PROMPT,
		`Today is ${today}.\nInstruction: ${instruction}\nEvents: ${JSON.stringify(events)}\nCalendars: ${JSON.stringify(calendars)}`
	);
	if (!json) return [];
	return parseBulkPlan(JSON.stringify(json), events.map((e) => e.id));
}
