import type { EditDraft } from '$lib/components/tasks/EditTaskDialog.svelte';

/** Edit-dialog save plumbing for the tasks page (#039): pure payload build.
 * Visibility is owner-only (issue 019): the server 403s anyone else, so a
 * non-owner assignee never sends the field (undefined keys are dropped by
 * JSON.stringify). */

export interface EditTarget {
	id: string;
	userId: string;
	assignedTo?: string | null;
}

// Parse the comma-separated tags input from the edit dialog into a
// normalized list: trimmed, lowercased, #-stripped, deduped, empties dropped.
export function parseEditTags(raw: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const part of raw.split(',')) {
		const tag = part.trim().toLowerCase().replace(/^#/, '');
		if (tag && !seen.has(tag)) {
			seen.add(tag);
			out.push(tag);
		}
	}
	return out;
}

export function inputToIso(value: string): string | null {
	if (!value) return null;
	const [y, m, d] = value.split('-').map(Number);
	return new Date(y, m - 1, d, 23, 59, 0, 0).toISOString();
}

export interface EditPayload {
	title: string;
	notes: string | null;
	dueDate: string | null;
	recurrenceFrequency: string | null;
	recurrenceInterval: number | null;
	assignedTo: string | null;
	priority: string;
	tags: string[];
	visibility?: string;
	assignmentStatus?: string | null;
}

export function buildEditPayload(
	editing: EditTarget,
	draft: EditDraft,
	currentUserId: string | undefined
) {
	const prevAssignee = editing.assignedTo ?? '';
	const assignedTo: string | null = draft.assignedTo || null;
	let assignmentStatus: string | null = null;
	if (assignedTo !== prevAssignee) {
		assignmentStatus = assignedTo ? (assignedTo === currentUserId ? 'accepted' : 'pending') : null;
	}
	const payload: EditPayload = {
		title: draft.title.trim(),
		notes: draft.notes.trim() || null,
		dueDate: inputToIso(draft.due),
		recurrenceFrequency: draft.freq || null,
		recurrenceInterval: draft.freq ? Math.max(1, Math.floor(draft.interval)) : null,
		assignedTo,
		priority: draft.priority,
		tags: parseEditTags(draft.tags),
		// Owner-only: see module contract above.
		visibility: editing.userId === currentUserId ? draft.visibility : undefined
	};
	if (assignmentStatus !== null) payload.assignmentStatus = assignmentStatus;
	return { payload };
}
