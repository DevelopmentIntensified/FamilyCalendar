/**
 * access merge-guest screen's pure UI rules: the prompt's copy and the three
 * label helpers (the counts it states, the primary button, which sentence
 * shape it uses).
 *
 * Its own file, not part of `access.auth.rules`, for ADR 0010: Rollup ships a
 * module's used exports as one chunk, and `/merge-guest` is a bare page that
 * must not download the login, signup, claim and recovery copy to show these
 * nine strings.
 *
 * Doc: ./README.md#invariants
 */

export const MERGE_EVENT_MOVE_NOTE = 'Events move onto your personal calendar';
export const MERGE_CHECKLIST_NOTE = 'Event checklists come along too';
export const MERGE_CLEANUP_NOTE = 'The guest profile is cleaned up';
export const MERGE_SKIP_LINK = 'Start fresh without them';
export const MERGE_SKIP_CONFIRM = 'Leave them behind?';
export const MERGE_SKIP_YES = 'Yes';
export const MERGE_SKIP_NO = 'No';
export const MERGE_BUSY = 'Bringing them over...';
export const MERGE_SKIP_BUSY = 'Starting fresh…';

/** "3 events" / "1 task": the counts the merge prompt states. */
export function mergeCountLabel(count: number, singular: 'event' | 'task'): string {
	return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** The primary button's label, "Bring my N items over". */
export function mergeBringLabel(events: number, tasks: number): string {
	return `Bring my ${events + tasks} items over`;
}

/** Which sentence shape the prompt uses: both kinds, one kind, or the other. */
export function mergeSentenceKind(events: number, tasks: number): 'both' | 'events' | 'tasks' {
	if (events > 0 && tasks > 0) return 'both';
	return events > 0 ? 'events' : 'tasks';
}
