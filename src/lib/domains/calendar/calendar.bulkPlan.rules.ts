/**
 * The deterministic smart-bulk planner, ported from `bulkAiService.ts`. It
 * parses an instruction against the selected events: absolute dates and times,
 * calendar names, and named-event subsets. A delete verb alone deletes; a
 * delete verb beside a concrete edit prefers the non-destructive move.
 *
 * The cloud-AI fallback is deliberately absent (Q-050): without a provider port
 * the endpoint's honest answer is the 422. `parseBulkPlan` still validates a
 * client-posted plan against the editable ids.
 *
 * The month/weekday words are duplicated from the legacy date vocabulary
 * because `parsing` (their owning module) has not exported them yet; they move
 * to `parsing` when it ports. Everything here is pure.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';

export interface BulkEventSummary {
	readonly id: string;
	readonly title: string;
	readonly start: string;
	readonly location: string | null;
}

export interface BulkCalendarRef {
	readonly id: string;
	readonly name: string;
}

export interface BulkPlanOp {
	readonly id: string;
	readonly title?: string;
	readonly date?: string;
	readonly startTime?: string;
	readonly endTime?: string;
	readonly location?: string;
	readonly allDay?: boolean;
	readonly calendarId?: string;
	readonly delete?: boolean;
}

/** Longest month token first so "september" wins over "sept"/"sep". */
const MONTH_ALT =
	'january|february|september|december|november|october|august|april|march|june|july|jun|jul|may|sept|jan|feb|mar|apr|aug|sep|oct|nov|dec';

const MONTH_INDEX: Readonly<Record<string, number>> = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
	jan: 1,
	feb: 2,
	mar: 3,
	apr: 4,
	jun: 6,
	jul: 7,
	aug: 8,
	sep: 9,
	sept: 9,
	oct: 10,
	nov: 11,
	dec: 12
};

const DAY_ALT = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';

/** JS weekday order (Sunday = 0), matching the legacy vocabulary. */
const DAY_NUMBER: Readonly<Record<string, number>> = {
	sunday: 0,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyPeriod(hour: number, period?: string): number {
	const meridiem = period?.toLowerCase();
	if (meridiem === 'pm' && hour < 12) return hour + 12;
	if (meridiem === 'am' && hour === 12) return 0;
	return hour;
}

/**
 * Resolve a date expression against `today`. Returns `YYYY-MM-DD` or null.
 * Patterns are ordered most-explicit first. `skipBareDay` is set when the
 * instruction carries a delete verb: "delete the 3rd item" is the 3rd selected
 * event, not the 3rd of the month.
 */
export function resolveBulkDate(
	lower: string,
	today: DateTime,
	skipBareDay = false
): string | null {
	const iso = lower.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
	if (iso) {
		const dt = DateTime.fromObject({ year: +iso[1], month: +iso[2], day: +iso[3] });
		if (dt.isValid) return dt.toISODate();
	}

	// "next <month>" — always next year, day 1.
	const nextMonthName = lower.match(new RegExp(`\\bnext\\s+(${MONTH_ALT})\\b`));
	if (nextMonthName) {
		const dt = DateTime.fromObject({
			year: today.year + 1,
			month: MONTH_INDEX[nextMonthName[1]],
			day: 1
		});
		if (dt.isValid) return dt.toISODate();
	}

	// Month-day: "aug 28", "august 28th", "sept 5, 2026". Without an explicit
	// year, roll to next year only when the date sits >3 months in the past.
	const monthDay = lower.match(
		new RegExp(`\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`)
	);
	if (monthDay) {
		const month = MONTH_INDEX[monthDay[1]];
		const day = +monthDay[2];
		let year = monthDay[3] ? +monthDay[3] : today.year;
		let dt = DateTime.fromObject({ year, month, day });
		if (!monthDay[3] && dt.isValid && dt < today.minus({ months: 3 })) {
			year += 1;
			dt = DateTime.fromObject({ year, month, day });
		}
		if (dt.isValid) return dt.toISODate();
	}

	// Day-month: "28 aug", "21st of september" (same year rule).
	const dayMonth = lower.match(
		new RegExp(
			`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALT})\\.?(?:,?\\s*(20\\d{2}))?\\b`
		)
	);
	if (dayMonth) {
		const day = +dayMonth[1];
		const month = MONTH_INDEX[dayMonth[2]];
		let year = dayMonth[3] ? +dayMonth[3] : today.year;
		let dt = DateTime.fromObject({ year, month, day });
		if (
			!dayMonth[3] &&
			day >= 1 &&
			day <= 31 &&
			dt.isValid &&
			dt < today.minus({ months: 3 })
		) {
			year += 1;
			dt = DateTime.fromObject({ year, month, day });
		}
		if (day >= 1 && day <= 31 && dt.isValid) return dt.toISODate();
	}

	// Bare day-of-month: "the 26th", "on the 3rd" — nearest future date.
	const bareDay =
		!skipBareDay &&
		lower.match(/(?:\bthe\s+(\d{1,2})(?:st|nd|rd|th)?|\b(\d{1,2})(?:st|nd|rd|th))\b/);
	if (bareDay) {
		const day = +(bareDay[1] ?? bareDay[2]);
		if (day >= 1 && day <= 31) {
			let dt = DateTime.fromObject({ year: today.year, month: today.month, day });
			if (!dt.isValid || dt < today.startOf('day')) {
				const next = today.plus({ months: 1 });
				dt = DateTime.fromObject({ year: next.year, month: next.month, day });
			}
			if (dt.isValid) return dt.toISODate();
		}
	}

	if (/\byesterday\b/.test(lower)) return today.minus({ days: 1 }).toISODate();
	if (/\btomorrow\b/.test(lower)) return today.plus({ days: 1 }).toISODate();
	if (/\btoday\b/.test(lower)) return today.toISODate();

	if (/\blast week\b/.test(lower)) return today.minus({ weeks: 1 }).toISODate();
	if (/\blast month\b/.test(lower)) return today.minus({ months: 1 }).toISODate();
	if (/\bnext week\b/.test(lower)) return today.plus({ weeks: 1 }).toISODate();
	if (/\bnext month\b/.test(lower)) return today.plus({ months: 1 }).toISODate();

	// "last weekend" — the Saturday just gone.
	if (/\blast weekend\b/.test(lower)) {
		let daysSinceSaturday = ((today.weekday % 7) - 6 + 7) % 7;
		if (daysSinceSaturday === 0) daysSinceSaturday = 7;
		return today.minus({ days: daysSinceSaturday }).toISODate();
	}

	// "this/next weekend" or bare "weekend" — the upcoming Saturday.
	if (/\b(?:this|next)?\s*weekend\b/.test(lower)) {
		let daysUntilSaturday = (6 - (today.weekday % 7) + 7) % 7;
		if (daysUntilSaturday === 0) daysUntilSaturday = 7;
		return today.plus({ days: daysUntilSaturday }).toISODate();
	}

	// "last <weekday>" — most recent past occurrence (before the generic match).
	const lastDayMatch = lower.match(new RegExp(`\\blast\\s+(${DAY_ALT})\\b`));
	if (lastDayMatch) {
		const target = DAY_NUMBER[lastDayMatch[1]] ?? 0;
		const current = today.weekday % 7;
		let daysSince = (current - target + 7) % 7;
		if (daysSince === 0) daysSince = 7;
		return today.minus({ days: daysSince }).toISODate();
	}

	// Weekday, optionally "next/this/on <day>": upcoming occurrence 1-7 days out.
	const dayMatch = lower.match(new RegExp(`\\b(?:next|this|on)?\\s*(${DAY_ALT})\\b`));
	if (dayMatch) {
		const target = DAY_NUMBER[dayMatch[1]] ?? 0;
		const current = today.weekday % 7;
		let daysUntil = target - current;
		if (daysUntil <= 0) daysUntil += 7;
		return today.plus({ days: daysUntil }).toISODate();
	}

	return null;
}

/** Resolve a time expression to `HH:mm`, or null. */
export function resolveBulkTime(lower: string): string | null {
	// A number is only a time when anchored: "at 6pm", "3pm" or "15:00".
	let match = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
	if (!match) match = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
	if (!match) match = lower.match(/\b(\d{1,2}):(\d{2})\b/);
	if (!match) return null;
	const hour = +match[1];
	if (hour > 23) return null;
	const minute = match[2] ? +match[2] : 0;
	if (minute > 59) return null;
	const normalized = applyPeriod(hour, match[3]);
	return `${normalized.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/** Find a calendar referenced by name ("to family", "personal calendar"). */
export function resolveBulkCalendar(
	lower: string,
	calendars: readonly BulkCalendarRef[]
): string | null {
	for (const calendar of calendars) {
		const name = calendar.name.toLowerCase().trim();
		// Word-boundary match so "test" doesn't hit "latest"; skip short names.
		if (name.length >= 3 && new RegExp(`\\b${escapeRegExp(name)}\\b`).test(lower)) {
			return calendar.id;
		}
	}
	// Try the name without the "calendar" suffix: "to family" → "Family Calendar".
	for (const calendar of calendars) {
		const stem = calendar.name
			.toLowerCase()
			.replace(/\bcalendar(s)?\b/g, '')
			.trim();
		if (stem.length >= 3 && new RegExp(`\\b${escapeRegExp(stem)}\\b`).test(lower)) {
			return calendar.id;
		}
	}
	return null;
}

/** Events explicitly named in the instruction; empty means "all selected". */
function selectTargets(lower: string, events: readonly BulkEventSummary[]): BulkEventSummary[] {
	return events.filter(
		(event) => event.title && event.title.length > 3 && lower.includes(event.title.toLowerCase())
	);
}

/**
 * The deterministic planner. Returns [] when nothing in the instruction is
 * actionable — the endpoint answers its 422 and reports the phrase.
 */
export function planBulkEdits(
	instruction: string,
	events: readonly BulkEventSummary[],
	today: string,
	calendars: readonly BulkCalendarRef[] = []
): BulkPlanOp[] {
	const lower = instruction.toLowerCase();
	const todayDt = DateTime.fromISO(today);

	// Named events first, so delete verbs can be tested with titles stripped
	// out ("move Trash pickup to friday" is a move, not a wipe).
	const targets = selectTargets(lower, events);
	const titleStripped = targets.reduce(
		(acc, event) => acc.split(event.title.toLowerCase()).join(' '),
		lower
	);
	const deleteWord = /\b(deletes?|removes?|cancel|trash|scrap)\b/.test(titleStripped);

	const date = resolveBulkDate(lower, todayDt, deleteWord);
	const time = resolveBulkTime(lower);
	const calendarId = resolveBulkCalendar(lower, calendars);

	// A delete verb beside a concrete edit is ambiguous — prefer the move.
	const isDelete = deleteWord && !date && !time && !calendarId;

	if (!isDelete && !date && !time && !calendarId) return [];

	const affected = targets.length > 0 ? targets : events;

	return affected.map((event) => {
		if (isDelete) return { id: event.id, delete: true };
		const op: BulkPlanOp = { id: event.id };
		if (date) op.date = date;
		if (time) {
			op.startTime = time;
			op.endTime = DateTime.fromFormat(time, 'HH:mm')
				.plus({ hours: 1 })
				.toFormat('HH:mm');
		}
		if (calendarId) op.calendarId = calendarId;
		return op;
	});
}

function isValidTime(value: string): boolean {
	const match = value.match(/^(\d{1,2}):(\d{2})$/);
	return !!match && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function isValidBulkId(value: string): boolean {
	return /^[A-Za-z0-9_-]{5,64}$/.test(value);
}

/**
 * Validate a posted plan (the client's reviewed copy, or an AI answer) against
 * the editable ids. Unknown ids and duplicate ids are dropped; an op with
 * nothing but its id is dropped; `delete: true` wins over the other fields.
 */
export function parseBulkPlan(content: string, allowedIds: readonly string[]): BulkPlanOp[] {
	try {
		const json: unknown = JSON.parse(content);
		const record = json as { ops?: unknown } | null;
		const rawOps: unknown[] = Array.isArray(json)
			? json
			: record && Array.isArray(record.ops)
				? record.ops
				: [];
		const seen = new Set<string>();
		const ops: BulkPlanOp[] = [];
		for (const entry of rawOps) {
			if (!entry || typeof entry !== 'object') continue;
			const op = entry as Record<string, unknown>;
			if (typeof op.id !== 'string' || !allowedIds.includes(op.id) || seen.has(op.id)) continue;

			if (op.delete === true) {
				ops.push({ id: op.id, delete: true });
				seen.add(op.id);
				continue;
			}

			const clean: {
				id: string;
				title?: string;
				date?: string;
				startTime?: string;
				endTime?: string;
				location?: string;
				allDay?: boolean;
				calendarId?: string;
			} = { id: op.id };
			if (typeof op.title === 'string' && op.title.trim()) clean.title = op.title.trim();
			if (typeof op.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(op.date)) {
				clean.date = op.date;
			}
			if (typeof op.startTime === 'string' && isValidTime(op.startTime)) {
				clean.startTime = op.startTime.padStart(5, '0');
			}
			if (typeof op.endTime === 'string' && isValidTime(op.endTime)) {
				clean.endTime = op.endTime.padStart(5, '0');
			}
			if (typeof op.location === 'string' && op.location.trim()) {
				clean.location = op.location.trim();
			}
			if (typeof op.allDay === 'boolean') clean.allDay = op.allDay;
			if (typeof op.calendarId === 'string' && isValidBulkId(op.calendarId)) {
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
