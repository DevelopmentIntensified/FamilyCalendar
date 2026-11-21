/**
 * tasks cursor rules: the Recurring Task cursor v3 policy (`nextCursorDue`),
 * the undo rewind (`derivePreviousDue`) and the overdue pin
 * (`needsOverduePin`, `pinnedDueFor`).
 *
 * Pure: `now` and the IANA zone are parameters (rule R5), and the frequency is
 * the column's text — the closed set is kernel/time's `RecurrenceFrequency`
 * (shared with calendar and parsing), so this module neither declares nor
 * re-exports it. An unknown frequency makes every function answer `null`
 * ("leave the cursor"), which is unreachable through the API because both
 * write paths validate the closed set first.
 *
 * The step arithmetic is the ONE stepper's: month/year steps go through
 * kernel/time's `addMonthsClamped` (K-06) instead of a second clamp table.
 * Daily/weekly are plain day/week additions in the caller's zone.
 *
 * The pin is module-internal on purpose: a read-side service concern, never an
 * interface other modules call, so `index.ts` does not re-export these.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { addMonthsClamped } from '$lib/kernel/time/dates';

/** The frequency column's four known values (kernel/time's closed set). */
function isKnownFrequency(frequency: string): boolean {
	return (
		frequency === 'daily' ||
		frequency === 'weekly' ||
		frequency === 'monthly' ||
		frequency === 'yearly'
	);
}

/** Legacy `Math.max(1, Math.floor(interval) || 1)`. */
function stepOf(interval: number | null | undefined): number {
	return Math.max(1, Math.floor(interval ?? 1) || 1);
}

/**
 * The instant shape rows arrive in: a `Date` is an instant (read in UTC), and
 * a string keeps its own offset — a Postgres `mode:'string'` render
 * (`2026-02-01 10:00:00+00`) is parsed by its `+00`, not the process zone.
 * That is what makes an undo anchored on the stored completion row
 * deterministic.
 */
function parseStored(value: string | Date | null | undefined): DateTime | null {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : DateTime.fromJSDate(value, { zone: 'utc' });
	}
	if (value === null || value === undefined || value === '') return null;
	const parsed = DateTime.fromISO(String(value).trim().replace(' ', 'T'), { setZone: true });
	return parsed.isValid ? parsed : null;
}

/**
 * Advance `dt` by `step` occurrences of `frequency`. Month/year steps go
 * through `addMonthsClamped`, then re-apply the time of day so a due date at
 * noon stays at noon (the clamp only decides the calendar day).
 */
function plus(dt: DateTime, frequency: string, step: number): DateTime | null {
	if (!isKnownFrequency(frequency)) return null;
	if (frequency === 'daily') return dt.plus({ days: step });
	if (frequency === 'weekly') return dt.plus({ weeks: step });
	const date = dt.toISODate();
	if (!date) return null;
	const months = frequency === 'monthly' ? step : step * 12;
	const shifted = addMonthsClamped(date, months);
	if (!shifted) return null;
	const zoneName = dt.zoneName;
	if (!zoneName) return null;
	const parsed = DateTime.fromISO(shifted, { zone: zoneName });
	if (!parsed.isValid) return null;
	return parsed.set({
		hour: dt.hour,
		minute: dt.minute,
		second: dt.second,
		millisecond: dt.millisecond
	});
}

/** The next occurrence strictly past `due`, anchored on `anchorDay`. */
function advanceFrom(
	due: DateTime | null,
	frequency: string,
	step: number,
	anchorDay: DateTime
): string | null {
	let n = 1;
	let next = plus(anchorDay, frequency, step);
	if (!next) return null;
	while (due && next <= due && n < 1000) {
		n += 1;
		const candidate = plus(anchorDay, frequency, step * n);
		if (!candidate) return null;
		next = candidate;
	}
	return next.toISO();
}

/**
 * The Recurring Task cursor v3 advance: today's start (in `zone`) + n×interval,
 * where n is the smallest multiple landing STRICTLY past the current due. A
 * null due anchors at today + one interval; an early check advances from
 * today; a due exactly one interval out takes two.
 *
 * Returns an ISO string carrying the zone's offset (the shape the
 * `mode:'string'` `dueDate` column stores), or `null` for an unknown
 * frequency.
 */
export function nextCursorDue(
	due: string | Date | null,
	frequency: string,
	interval: number | null,
	now: Date,
	zone: string
): string | null {
	const anchorDay = DateTime.fromJSDate(now, { zone }).startOf('day');
	if (!anchorDay.isValid) return null;
	return advanceFrom(parseStored(due), frequency, stepOf(interval), anchorDay);
}

/**
 * The previous cursor an undo restores (legacy `derivePreviousCursor`): rewind
 * `due` interval-by-interval and keep the first candidate whose re-advance,
 * anchored on the completion instant, reproduces `due` exactly. Falls back to
 * a plain one-interval rewind when nothing matches (a hand-edited due date).
 *
 * `anchor` is the latest completion row's `completedAt` (a Postgres render, so
 * its offset decides the anchor day, as legacy does); absent, `now` is the
 * anchor read in UTC, which is what legacy's `new Date().toISOString()`
 * produced.
 */
export function derivePreviousDue(
	due: string | null,
	frequency: string,
	interval: number | null,
	anchor: string | Date | null,
	now: Date
): string | null {
	if (!isKnownFrequency(frequency)) return null;
	const dueAt = parseStored(due);
	if (!dueAt) return null;
	const normalized = dueAt.toISO();
	if (!normalized) return null;
	const step = stepOf(interval);
	const anchorDay = (
		parseStored(anchor) ?? DateTime.fromJSDate(now, { zone: 'utc' })
	).startOf('day');
	if (!anchorDay.isValid) return null;

	for (let k = 1; k <= 366; k += 1) {
		const candidate = plus(dueAt, frequency, -step * k);
		if (!candidate) return null;
		const reAdvanced = advanceFrom(candidate, frequency, step, anchorDay);
		if (reAdvanced === normalized) return candidate.toISO();
	}
	return plus(dueAt, frequency, -step)?.toISO() ?? null;
}

/**
 * Whether an open recurring row's due date needs the overdue pin: strictly
 * before today's start in `zone`. A null due never pins, and a due later
 * today never pins.
 */
export function needsOverduePin(due: string | Date | null, now: Date, zone: string): boolean {
	const dueAt = parseStored(due);
	if (!dueAt) return false;
	const todayStart = DateTime.fromJSDate(now, { zone }).startOf('day');
	if (!todayStart.isValid) return false;
	return dueAt < todayStart;
}

/**
 * The pin's target: 23:59:00 local in `zone` today, offset included. The
 * second is zeroed exactly like legacy (`set({hour:23,minute:59,second:0})`).
 */
export function pinnedDueFor(now: Date, zone: string): string {
	const end = DateTime.fromJSDate(now, { zone }).set({
		hour: 23,
		minute: 59,
		second: 0,
		millisecond: 0
	});
	return end.toISO() ?? '';
}
