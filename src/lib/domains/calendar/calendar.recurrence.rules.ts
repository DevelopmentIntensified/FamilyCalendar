/**
 * Recurrence rules: the one expansion algorithm, the one write shape, and the
 * one human label (ported from `recurrenceService.ts`, `eventRecurrence.ts` and
 * `icsImportPreview.ts`). Pure: `now`, the viewer's zone and the row are
 * parameters, so tests pin them and no caller reads a clock.
 *
 * The four frequencies are `kernel/time`'s closed set (`RecurrenceFrequency`),
 * and month stepping is kernel/time's month arithmetic (`addMonthsClamped`):
 * calendar does not own a second one. Instants step in UTC so stored Exception
 * Override keys keep matching; calendar-day questions (BYDAY weekday, week
 * phase, date-only UNTIL) are read in the viewer's zone.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import {
	addMonthsClamped,
	toInstantString,
	type RecurrenceFrequency
} from '$lib/kernel/time/dates';

export type { RecurrenceFrequency };

/** The closed frequency vocabulary, in RFC 5545 FREQ order. */
export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;

/** How many in-window occurrences one series may emit per expansion. */
export const MAX_OCCURRENCES = 500;

const WEEKDAY_LETTERS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const WEEKDAY_NAMES: Readonly<Record<string, string>> = {
	MO: 'Mon',
	TU: 'Tue',
	WE: 'Wed',
	TH: 'Thu',
	FR: 'Fri',
	SA: 'Sat',
	SU: 'Sun'
};

const FREQ_WORDS: Readonly<Record<RecurrenceFrequency, readonly [unit: string, plural: string]>> =
	{
		daily: ['day', 'days'],
		weekly: ['week', 'weeks'],
		monthly: ['month', 'months'],
		yearly: ['year', 'years']
	};

/** The recurrence columns of an Event row, exactly as the table stores them. */
export interface RecurrenceShape {
	readonly recurrenceFrequency: string | null;
	readonly recurrenceInterval: number | null;
	readonly recurrenceByDay: string[] | null;
	readonly recurrenceCount: number | null;
	readonly recurrenceUntil: string | Date | null;
}

/** A row `expandRecurrence` can expand: the anchor plus its recurrence columns. */
export interface RecurringEventInput extends RecurrenceShape {
	readonly id: string;
	readonly start: string | Date;
	readonly end?: string | Date | null;
}

/** The full write shape every event writer funnels through. */
export interface EventRecurrenceInput {
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
	recurrenceByDay?: unknown;
	recurrenceCount?: unknown;
	recurrenceUntil?: unknown;
}

export interface EventRecurrenceWrite {
	recurrenceFrequency: RecurrenceFrequency | null;
	recurrenceInterval: number | null;
	recurrenceByDay: string[] | null;
	recurrenceCount: number | null;
	recurrenceUntil: string | null;
}

/** True for the four RFC 5545 frequencies this module writes. */
export function isRecurrenceFrequency(value: string | null | undefined): value is RecurrenceFrequency {
	return (
		value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'yearly'
	);
}

/**
 * The one timestamp parser for recurrence: ISO strings, Postgres's
 * space-separated render and `Date` instances all become a UTC DateTime, or
 * null when the value is absent/invalid. Kernel/time owns the parsing rule.
 */
function parseUtc(value: string | Date | null | undefined): DateTime | null {
	const iso = toInstantString(value);
	if (!iso) return null;
	const dt = DateTime.fromISO(iso, { zone: 'utc' });
	return dt.isValid ? dt : null;
}

/** Normalize BYDAY to a set of plain weekday letters (MO..SU). */
function normalizeByDay(raw?: readonly string[] | null): Set<string> | null {
	if (!raw || raw.length === 0) return null;
	const days = raw.filter(
		(day): day is string => typeof day === 'string' && WEEKDAY_LETTERS.includes(day.toUpperCase())
	);
	return days.length > 0 ? new Set(days.map((day) => day.toUpperCase())) : null;
}

/**
 * The ONE frequency+interval stepper. Advances `dt` by `interval × n` steps of
 * `frequency` in UTC, clamping monthly/yearly into the short month (Jan 31 + 1
 * month → Feb 28; Feb 29 + 1 year → Feb 28). Throws on a frequency outside the
 * closed set: callers validate at the boundary, so a throw is a bug.
 *
 * A clamped step re-anchors on the clamped date; `expandRecurrence` avoids
 * that drift by always stepping from the original start.
 */
export function scheduleStep(
	dt: DateTime,
	frequency: RecurrenceFrequency,
	interval: number,
	n = 1
): DateTime {
	if (!isRecurrenceFrequency(frequency)) {
		throw new Error(`Unknown recurrence frequency: ${String(frequency)}`);
	}
	const step = interval * n;
	if (frequency === 'daily') return dt.plus({ days: step });
	if (frequency === 'weekly') return dt.plus({ weeks: step });
	const months = frequency === 'monthly' ? step : step * 12;
	const shifted = addMonthsClamped(dt.toFormat('yyyy-MM-dd'), months);
	if (!shifted) return DateTime.invalid('month step out of range');
	// The date moved; the wall-clock time of day must ride along.
	return dt.set({
		year: Number(shifted.slice(0, 4)),
		month: Number(shifted.slice(5, 7)),
		day: Number(shifted.slice(8, 10))
	});
}

/** One generated occurrence, including the yearly Feb-29 roll-forward. */
function generateOccurrence(
	anchor: DateTime,
	frequency: RecurrenceFrequency,
	steps: number
): DateTime {
	const next = scheduleStep(anchor, frequency, steps);
	if (frequency === 'yearly' && next.isValid && next.day < anchor.day) {
		// Luxon clamped backward (e.g. Feb 29 -> Feb 28 in a non-leap year);
		// roll forward to the first of the next month instead.
		return next.plus({ months: 1 }).set({ day: 1 });
	}
	return next;
}

/**
 * Expands a Recurring Event into concrete occurrence starts within
 * `[windowStart, windowEnd)`. Non-recurring Events count when they OVERLAP the
 * window (`start < windowEnd && end >= windowStart`, #217). Occurrences are
 * generated from the original start anchor; COUNT is series-total while
 * MAX_OCCURRENCES caps only in-window emissions; UNTIL is inclusive.
 *
 * `zone` is where BYDAY weekdays and the week phase are read (#215).
 */
export function expandRecurrence(
	event: RecurringEventInput,
	windowStart: Date,
	windowEnd: Date,
	zone = 'utc'
): Date[] {
	const anchor = parseUtc(event.start);
	if (!anchor) return [];

	const frequency = isRecurrenceFrequency(event.recurrenceFrequency)
		? event.recurrenceFrequency
		: null;
	if (!frequency) {
		const start = anchor.toJSDate();
		const end = event.end ? parseUtc(event.end) : null;
		const last = end?.isValid ? end.toJSDate() : start;
		return start < windowEnd && last >= windowStart ? [start] : [];
	}

	const interval = Math.max(1, event.recurrenceInterval ?? 1);
	const byDay = normalizeByDay(event.recurrenceByDay);
	// BYDAY is a daily/weekly rule only; monthly/yearly fall back to plain
	// frequency stepping (anchor weekday).
	if (byDay && (frequency === 'daily' || frequency === 'weekly')) {
		return expandWeekdaySeries(
			anchor,
			frequency,
			interval,
			byDay,
			positiveCount(event.recurrenceCount),
			recurrenceUntilInstant(event, zone),
			windowStart,
			windowEnd,
			zone
		);
	}

	const count = positiveCount(event.recurrenceCount);
	const until = recurrenceUntilInstant(event, zone);

	const occurrences: Date[] = [];
	let steps = 0;
	let total = 0;
	let emitted = 0;
	while (emitted < MAX_OCCURRENCES) {
		const occ = generateOccurrence(anchor, frequency, steps * interval);
		if (!occ.isValid) break;
		const date = occ.toJSDate();
		total++;
		if (count !== null && total > count) break;
		if (until !== null && date > until) break;
		if (date >= windowEnd) break;
		if (date >= windowStart) {
			occurrences.push(date);
			emitted++;
		}
		steps++;
	}
	return occurrences;
}

/** A positive whole count, or null (unbounded). */
function positiveCount(raw?: number | null): number | null {
	return raw && raw > 0 ? Math.floor(raw) : null;
}

/**
 * The series cutoff instant (RRULE UNTIL), or null when unbounded. A DATE-ONLY
 * UNTIL is inclusive end-of-day in the viewer's zone (#216); a full timestamp
 * keeps its exact instant.
 *
 * The date-only branch is an in-memory rule only: the write side (Q-106) now
 * stores a date-only UNTIL as the creator-zone end-of-day instant, but a row
 * stored before that keeps its UTC-midnight cutoff, and the `timestamptz`
 * column never reads back a date-only string.
 */
export function recurrenceUntilInstant(
	event: Pick<RecurringEventInput, 'recurrenceUntil'>,
	zone: string
): Date | null {
	const raw = event.recurrenceUntil;
	if (!raw) return null;
	if (!(raw instanceof Date)) {
		const text = String(raw).trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
			const dt = DateTime.fromISO(text, { zone }).endOf('day');
			return dt.isValid ? dt.toJSDate() : null;
		}
	}
	const dt = parseUtc(raw);
	return dt ? dt.toJSDate() : null;
}

/**
 * Expand a BYDAY series day-by-day from the anchor so every listed weekday is
 * reached and weekly INTERVAL phase is respected. COUNT consumes from the
 * series start; MAX_OCCURRENCES caps only in-window emissions.
 */
function expandWeekdaySeries(
	anchor: DateTime,
	frequency: RecurrenceFrequency,
	interval: number,
	byDay: Set<string>,
	count: number | null,
	until: Date | null,
	windowStart: Date,
	windowEnd: Date,
	zone: string
): Date[] {
	const occurrences: Date[] = [];
	let total = 0;
	let emitted = 0;
	let cur = anchor;
	const windowEndMs = windowEnd.getTime();
	const anchorWeek = anchor.setZone(zone).startOf('week');

	while (emitted < MAX_OCCURRENCES) {
		const local = cur.setZone(zone);
		const weekday = WEEKDAY_LETTERS[local.weekday - 1];
		let passes: boolean;
		if (frequency === 'daily') {
			passes = byDay.has(weekday);
		} else {
			// A DST shift inside the span makes the diff fractional; round.
			const weeksFromAnchor = Math.round(
				local.startOf('week').diff(anchorWeek, 'weeks').weeks
			);
			passes = byDay.has(weekday) && weeksFromAnchor % interval === 0;
		}

		if (passes) {
			total++;
			if (count !== null && total > count) break;
			const date = cur.toJSDate();
			if (until !== null && date > until) break;
			if (date >= windowStart && date < windowEnd) {
				occurrences.push(date);
				emitted++;
			}
		}

		cur = cur.plus({ days: 1 });
		if (cur.toMillis() >= windowEndMs) break;
	}
	return occurrences;
}

/**
 * The stored form of a write-time UNTIL (Q-106). A DATE-ONLY value
 * (`yyyy-MM-dd`) becomes the inclusive END of that day in `zone` — the
 * creator's zone — as a UTC instant, so "repeat until Oct 20" keeps the Oct 20
 * occurrence once the column (`timestamptz`) has dropped the date-only form. A
 * full date-time is stored exactly as sent. An unknown zone reads as UTC.
 */
export function endOfDayUntil(until: string, zone: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return until;
	const inZone = DateTime.fromISO(until, { zone }).endOf('day');
	const day = inZone.isValid ? inZone : DateTime.fromISO(until, { zone: 'utc' }).endOf('day');
	return day.isValid ? (day.toUTC().toISO() ?? until) : until;
}

/**
 * Normalize a full recurrence write. An absent or unknown frequency clears
 * every field — byDay/count/until are meaningless on a one-off Event. `zone` is
 * the writer's stored zone: a date-only UNTIL is its end of day there (Q-106).
 */
export function normalizeEventRecurrence(
	input: EventRecurrenceInput,
	zone: string
): EventRecurrenceWrite {
	const rawFrequency = input.recurrenceFrequency ?? '';
	const frequency = isRecurrenceFrequency(rawFrequency) ? rawFrequency : null;
	if (!frequency) {
		return {
			recurrenceFrequency: null,
			recurrenceInterval: null,
			recurrenceByDay: null,
			recurrenceCount: null,
			recurrenceUntil: null
		};
	}
	return {
		recurrenceFrequency: frequency,
		recurrenceInterval: Math.max(1, Math.floor(input.recurrenceInterval ?? 1)),
		recurrenceByDay: sanitizeRecurrenceByDay(input.recurrenceByDay),
		recurrenceCount: sanitizeRecurrenceCount(input.recurrenceCount),
		recurrenceUntil:
			typeof input.recurrenceUntil === 'string' && input.recurrenceUntil.length > 0
				? endOfDayUntil(input.recurrenceUntil, zone)
				: null
	};
}

/**
 * Keep plain weekday codes (MO..SU), uppercased, dropping any RRULE ordinal
 * prefix (`2TU` -> `TU`). Null when nothing valid remains.
 */
export function sanitizeRecurrenceByDay(raw: unknown): string[] | null {
	if (!Array.isArray(raw)) return null;
	const valid = new Set<string>(WEEKDAY_LETTERS);
	const days = raw
		.filter((day): day is string => typeof day === 'string')
		.map((day) => day.toUpperCase().replace(/^[+-]?\d+/, ''))
		.filter((day) => valid.has(day));
	return days.length > 0 ? days : null;
}

/** Positive integer counts only; anything else is unbounded (null). */
export function sanitizeRecurrenceCount(raw: unknown): number | null {
	return typeof raw === 'number' && raw > 0 ? Math.floor(raw) : null;
}

/**
 * The ONE human label for a recurrence ("every week on Mon, Wed, Fri",
 * "every 3 months", "… for 5 weeks", "… until Sep 7, 2026"). `tasks` borrows
 * this instead of keeping its own `freqNoun`. Null when not recurring.
 */
export function describeRecurrence(rec: RecurrenceShape, zone = 'utc'): string | null {
	const frequency = isRecurrenceFrequency(rec.recurrenceFrequency)
		? rec.recurrenceFrequency
		: null;
	if (!frequency) return null;
	const words = FREQ_WORDS[frequency];
	if (!words) return null;

	const n = Math.max(1, rec.recurrenceInterval ?? 1);
	const [unit, plural] = words;
	const lead = n === 1 ? `every ${unit}` : `every ${n} ${plural}`;

	const days = (rec.recurrenceByDay ?? [])
		.map((code) => WEEKDAY_NAMES[code.toUpperCase()])
		.filter((name): name is string => name !== undefined);
	const onDays = days.length > 0 ? ` on ${days.join(', ')}` : '';

	const count = rec.recurrenceCount;
	const until = rec.recurrenceUntil
		? parseUtc(rec.recurrenceUntil)?.setZone(zone) ?? null
		: null;

	let tail = '';
	if (count !== null && count > 0) {
		tail = ` for ${count} ${count === 1 ? unit : plural}`;
	} else if (until?.isValid) {
		tail = ` until ${until.toFormat('ccc, LLL d, yyyy')}`;
	}

	return `${lead}${onDays}${tail}`;
}
