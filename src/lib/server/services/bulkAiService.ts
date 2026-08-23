import { chatJson } from './llm';

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

const BULK_SYSTEM_PROMPT = `You edit calendar events in bulk. Given an instruction plus JSON lists of EVENTS and CALENDARS, decide which events change and how.

Return JSON: {"ops":[{"id":"<event id>","title":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","location":"...","allDay":false,"calendarId":"<calendar id>","delete":true}]}

RULES:
- Only include events that actually change; omit fields that stay the same.
- "date" moves an event (keep its time unless startTime/endTime given).
- Resolve relative dates ("next friday", "this weekend", "tomorrow") against the provided today.
- "calendarId" may ONLY be an id from the CALENDARS list - use it when the user names a calendar ("to family", "to personal").
- "delete": true ONLY for explicit removal requests ("delete/cancel/remove").
- Never invent ids outside the provided lists.
- Return {"ops":[]} when nothing applies.`;

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

export async function planBulkEdits(
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
