/**
 * Occurrence identity and the pure half of the display pipeline: composite ids
 * (`{masterId}~{UTC ISO}`), the Exception Override map, and the shift a
 * whole-series move applies to every override slot. Ported from `eventIds.ts`
 * and `eventDisplayService.ts`; the IO (which rows to read) lives in the repo.
 *
 * One rendering (`toInstantString`) builds the occurrence id, normalizes the
 * override key and shifts a slot, so parsing and construction cannot drift.
 *
 * Doc: ./README.md#invariants
 */
import { toInstantString } from '$lib/kernel/time/dates';
import { expandRecurrence, type RecurringEventInput } from './calendar.recurrence.rules';

/** Master ids are lucia `generateId(15)` strings or crypto uuids. */
const MASTER_ID_RE = /^[A-Za-z0-9_-]{5,64}$/;

export interface ResolvedOccurrenceId {
	readonly masterId: string;
	readonly occurrenceIso?: string;
}

/**
 * Normalize any timestamp shape into the exact UTC ISO rendering that
 * `expandRecurrence` / `.toISOString()` produce. Null when it cannot be parsed.
 */
export function normalizeOccurrenceIso(
	value: string | Date | null | undefined
): string | null {
	return toInstantString(value);
}

/** The single construction point for `{masterId}~{occurrenceISO}`. */
export function buildOccurrenceId(masterId: string, occurrenceIso: string): string {
	return `${masterId}~${occurrenceIso}`;
}

/** The bare master id from a possibly-composite id, or null when malformed. */
export function resolveMasterId(rawId: string | null | undefined): string | null {
	const master = String(rawId ?? '')
		.split('~')[0]
		.trim();
	return MASTER_ID_RE.test(master) ? master : null;
}

/**
 * Split a (possibly composite) occurrence id into its master id and, when
 * present, the occurrence ISO normalized to the shared UTC rendering. Null when
 * the master is malformed or the occurrence part is not an ISO instant.
 */
export function resolveOccurrenceId(
	rawId: string | null | undefined
): ResolvedOccurrenceId | null {
	const text = String(rawId ?? '').trim();
	const separator = text.indexOf('~');
	if (separator === -1) {
		return MASTER_ID_RE.test(text) ? { masterId: text } : null;
	}
	const master = text.slice(0, separator).trim();
	if (!MASTER_ID_RE.test(master)) return null;
	const occurrenceIso = normalizeOccurrenceIso(text.slice(separator + 1));
	if (!occurrenceIso) return null;
	return { masterId: master, occurrenceIso };
}

/** The shifted slot key and start/end overrides of one Exception Override. */
export interface ShiftedExceptionSlots {
	readonly originalDate: string;
	readonly start: string | null;
	readonly end: string | null;
}

function shiftInstant(deltaMs: number, value: string): string;
function shiftInstant(deltaMs: number, value: string | null): string | null;
function shiftInstant(deltaMs: number, value: string | null): string | null {
	return value == null ? null : new Date(new Date(value).getTime() + deltaMs).toISOString();
}

/** Shift one Exception Override's slot key plus start/end by the master shift. */
export function shiftException(
	exception: { readonly originalDate: string; readonly start: string | null; readonly end: string | null },
	deltaMs: number
): ShiftedExceptionSlots {
	return {
		originalDate: shiftInstant(deltaMs, exception.originalDate),
		start: shiftInstant(deltaMs, exception.start),
		end: shiftInstant(deltaMs, exception.end)
	};
}

/** The columns an expandable Event needs; every other column rides along. */
export interface OccurrenceSource extends RecurringEventInput {
	readonly title: string;
	readonly description: string | null;
	readonly location: string | null;
	readonly allDay: boolean;
}

/** The columns an Exception Override needs. */
export interface ExceptionSource {
	readonly eventId: string;
	readonly originalDate: string;
	readonly isCancelled: boolean;
	readonly title: string | null;
	readonly description: string | null;
	readonly location: string | null;
	readonly start: string | null;
	readonly end: string | null;
	readonly allDay: boolean | null;
}

/** The fields every displayed occurrence replaces on its master row. */
export interface OccurrenceFields {
	readonly id: string;
	readonly masterId: string;
	readonly occurrenceDate: string;
	readonly start: string;
	readonly end: string | null;
	readonly title: string;
	readonly description: string | null;
	readonly location: string | null;
	readonly allDay: boolean;
}

export type OccurrenceOf<T> = T & OccurrenceFields;

export interface ExpansionWindow {
	readonly start: Date;
	readonly end: Date;
}

/**
 * Expand masters into displayable occurrences, then apply the Exception
 * Overrides: a cancelled slot is dropped; an edited one merges
 * `title/description/location/allDay` over the master and lets `start`/`end`
 * replace the slot (end otherwise derives from the master's duration).
 *
 * Every occurrence carries the composite id plus `masterId` and
 * `occurrenceDate` (the recurrence slot, even when the start was overridden),
 * so the slot key never moves.
 */
export function expandEventOccurrences<T extends OccurrenceSource>(
	rows: readonly T[],
	exceptions: readonly ExceptionSource[],
	window: ExpansionWindow,
	zone = 'utc'
): OccurrenceOf<T>[] {
	const exceptionByKey = new Map(
		exceptions.map((exception) => [
			buildOccurrenceId(
				exception.eventId,
				normalizeOccurrenceIso(exception.originalDate) ??
					new Date(exception.originalDate).toISOString()
			),
			exception
		])
	);

	const result: OccurrenceOf<T>[] = [];
	for (const row of rows) {
		const occurrences = expandRecurrence(row, window.start, window.end, zone);
		if (occurrences.length === 0) continue;

		const durationMs = row.end ? new Date(row.end).getTime() - new Date(row.start).getTime() : null;

		for (const occurrence of occurrences) {
			const occurrenceIso = occurrence.toISOString();
			const exception = exceptionByKey.get(buildOccurrenceId(row.id, occurrenceIso));
			if (exception?.isCancelled) continue;

			const effectiveStart = exception?.start != null ? new Date(exception.start) : occurrence;
			const effectiveEnd =
				exception?.end != null
					? new Date(exception.end)
					: durationMs !== null
						? new Date(effectiveStart.getTime() + durationMs)
						: null;
			result.push(
				Object.assign({}, row, {
					id: buildOccurrenceId(row.id, occurrenceIso),
					masterId: row.id,
					occurrenceDate: occurrenceIso,
					start: effectiveStart.toISOString(),
					end: effectiveEnd ? effectiveEnd.toISOString() : null,
					title: exception?.title ?? row.title,
					description: exception?.description ?? row.description,
					location: exception?.location ?? row.location,
					allDay: exception?.allDay ?? row.allDay
				})
			);
		}
	}
	return result;
}
