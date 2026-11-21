/**
 * Access predicates, ported from `calendarScope.ts` minus its queries. Reads
 * span every calendar the viewer can see (personal plus every family they
 * belong to, #098); whole-series writes use the narrower owner leg (#165);
 * single-occurrence writes and the rsvp pair need only read access.
 *
 * The repo loads the id sets; these predicates decide, so a policy change is
 * one edit and every caller follows.
 *
 * Doc: ./README.md#invariants
 */
import { resolveMasterId } from './calendar.occurrence.rules';

/** The columns an access check needs from an Event row. */
export interface AccessRow {
	readonly ownerId: string;
	readonly calendarId: string | null;
}

/** True when the row is visible to the viewer (owner or readable calendar). */
export function isEventVisibleTo(
	row: AccessRow,
	userId: string,
	accessibleCalendarIds: readonly string[]
): boolean {
	return (
		row.ownerId === userId ||
		(!!row.calendarId && accessibleCalendarIds.includes(row.calendarId))
	);
}

/**
 * The issue-165 write leg: the viewer owns the Event OR owns the Calendar it
 * sits on. Read access on a shared family calendar is not enough.
 */
export function canMutateEventRow(
	row: AccessRow,
	userId: string,
	ownedCalendarIds: readonly string[]
): boolean {
	return row.ownerId === userId || (!!row.calendarId && ownedCalendarIds.includes(row.calendarId));
}

/**
 * Whether the viewer may touch one Event: `not-found` when there is no row,
 * `forbidden` when the row exists but neither leg holds, `allowed` otherwise.
 */
export function eventTouchDecision(
	row: AccessRow | null | undefined,
	userId: string,
	accessibleCalendarIds: readonly string[]
): 'not-found' | 'forbidden' | 'allowed' {
	if (!row) return 'not-found';
	return isEventVisibleTo(row, userId, accessibleCalendarIds) ? 'allowed' : 'forbidden';
}

/**
 * Dedupe a bulk request's ids down to their master ids, in first-seen order,
 * dropping malformed ids. A composite occurrence id targets its master.
 */
export function masterIdsIn(items: readonly { readonly id?: string | null }[]): string[] {
	const seen = new Set<string>();
	const ids: string[] = [];
	for (const item of items) {
		const master = resolveMasterId(item?.id ?? '');
		if (!master || seen.has(master)) continue;
		seen.add(master);
		ids.push(master);
	}
	return ids;
}
