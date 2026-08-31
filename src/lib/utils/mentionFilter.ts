import type { TaskQuickAddMember } from './taskQuickAdd';

/** Max suggestion rows the mention dropdown shows. */
export const MENTION_SUGGESTION_LIMIT = 8;

/**
 * Case-insensitive prefix filter over a family roster for the mention
 * dropdown. Matches firstName, lastName, or the combined "first last".
 * An empty/blank fragment returns the full roster (bounded). This is the
 * non-authoritative half of the pairing — `findTaskAssignee` decides what
 * actually survives quick-add parsing; this only decides what to surface.
 */
export function filterMentions(
	fragment: string,
	members: TaskQuickAddMember[]
): TaskQuickAddMember[] {
	const q = fragment.trim().toLowerCase();
	if (!q) return members.slice(0, MENTION_SUGGESTION_LIMIT);
	return members
		.filter((m) => {
			const first = m.firstName.toLowerCase();
			const last = m.lastName.toLowerCase();
			const full = [first, last].filter(Boolean).join(' ');
			return first.startsWith(q) || last.startsWith(q) || full.startsWith(q);
		})
		.slice(0, MENTION_SUGGESTION_LIMIT);
}
