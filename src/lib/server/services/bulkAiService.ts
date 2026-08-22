export interface BulkEventSummary {
	id: string;
	title: string;
	start: string;
	location: string | null;
}

export interface BulkPlanOp {
	id: string;
	title?: string;
	date?: string;
	startTime?: string;
	endTime?: string;
	location?: string;
	allDay?: boolean;
}

const BULK_SYSTEM_PROMPT = `You edit calendar events in bulk. Given an instruction and a JSON list of events, decide which events change and how.

Return JSON: {"ops":[{"id":"<event id>","title":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","location":"...","allDay":false}]}

RULES:
- Only include events that actually change. Omit fields that stay the same.
- "date" moves an event (keep its time unless startTime/endTime given).
- Relative dates ("next friday", "this weekend") resolve against the provided today.
- Never invent ids outside the provided list.
- Return {"ops":[]} when nothing applies.`;

function isValidTime(v: string): boolean {
	const m = v.match(/^(\d{1,2}):(\d{2})$/);
	return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

export function parseBulkPlan(content: string, allowedIds: string[]): BulkPlanOp[] {
	try {
		const json = JSON.parse(content);
		const rawOps = Array.isArray(json) ? json : Array.isArray(json?.ops) ? json.ops : [];
		const seen = new Set<string>();
		const ops: BulkPlanOp[] = [];
		for (const op of rawOps) {
			if (!op || typeof op.id !== 'string' || !allowedIds.includes(op.id) || seen.has(op.id)) continue;
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
	apiKey: string,
	today: string,
	apiUrl?: string
): Promise<BulkPlanOp[]> {
	const res = await fetch(apiUrl || process.env.CEREBRAS_API_URL || 'https://api.cerebras.ai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: 'llama-3.3-70b',
			messages: [
				{ role: 'system', content: BULK_SYSTEM_PROMPT },
				{
					role: 'user',
					content: `Today is ${today}.\nInstruction: ${instruction}\nEvents: ${JSON.stringify(events)}`
				}
			],
			response_format: { type: 'json_object' }
		})
	});
	if (!res.ok) return [];
	const data = await res.json();
	return parseBulkPlan(data.choices?.[0]?.message?.content || '', events.map((e) => e.id));
}
