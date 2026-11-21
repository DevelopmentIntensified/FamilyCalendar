/**
 * tasks editor rules — the edit sheet's draft turned into the `PUT
 * /api/tasks/[id]` body. Pure and owner-aware: `visibility` is sent only by the
 * owner (the server 403s anyone else), an unchanged assignee is omitted (the
 * server would read it as a handoff), and `category` is omitted when unchanged
 * and `null` when cleared.
 *
 * Legacy home: `utils/taskEditPayload.ts` (whose rules move here for the v2
 * editor; the legacy copy stays for `/family/tasks` until familyHub is ported).
 */

import type { TaskUpdatePayload } from './tasks.contract';

/** What the editor form holds, one field per control. */
export type TaskEditDraft = {
	title: string;
	notes: string;
	/** Comma-separated tags as typed. */
	tags: string;
	/** `YYYY-MM-DD` from the date input, or ''. */
	due: string;
	/** A recurrence frequency, or '' for "doesn't repeat". */
	freq: string;
	interval: number;
	assignedTo: string;
	priority: string;
	visibility: 'public' | 'private';
	category: string;
};

/** The columns the payload builder compares against. */
export type TaskEditTarget = {
	readonly userId: string;
	readonly assignedTo?: string | null;
	readonly category?: string | null;
};

/** Form input → wire value: trimmed, blank → null (`taskCategory.normalizeCategoryInput`). */
export function normalizeTaskCategoryInput(raw: string): string | null {
	const value = raw.trim();
	return value ? value : null;
}

/** Client-side guard mirroring the server's category 400s, for inline feedback. */
export function taskCategoryNameError(raw: string, maxLength = 80): string | null {
	const value = raw.trim();
	if (!value) return 'Name is required';
	if (value.length > maxLength) return `Keep it to ${maxLength} characters`;
	return null;
}

/** Comma-separated tags: trimmed, lowercased, `#`-stripped, deduped. */
export function parseTaskEditTags(raw: string): string[] {
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

/** A date input value to the wire's end-of-day instant, or null. */
export function taskInputToIso(value: string): string | null {
	if (!value) return null;
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day, 23, 59, 0, 0).toISOString();
}

/** An ISO instant back to the date input's `YYYY-MM-DD` (same local day). */
export function taskIsoToInput(value: string | Date | null | undefined): string {
	if (!value) return '';
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The `PUT` body for one save: title trimmed, blank notes/due/cadence → null,
 * interval floored to ≥ 1, tags normalized. The three optional keys follow the
 * rules in the file header.
 */
export function buildTaskEditPayload(
	target: TaskEditTarget,
	draft: TaskEditDraft,
	currentUserId: string | undefined
): TaskUpdatePayload {
	const previousAssignee = target.assignedTo ?? '';
	const assignedTo: string | null = draft.assignedTo || null;
	const assigneeChanged = (assignedTo ?? '') !== previousAssignee;

	const payload: TaskUpdatePayload = {
		title: draft.title.trim(),
		notes: draft.notes.trim() || null,
		dueDate: taskInputToIso(draft.due),
		recurrenceFrequency: draft.freq || null,
		recurrenceInterval: draft.freq ? Math.max(1, Math.floor(draft.interval)) : null,
		priority: draft.priority,
		tags: parseTaskEditTags(draft.tags),
		// Owner-only: the server 403s anyone else, so a non-owner never sends it.
		visibility: target.userId === currentUserId ? draft.visibility : undefined
	};
	if (assigneeChanged) {
		payload.assignedTo = assignedTo;
		payload.assignmentStatus = assignedTo
			? assignedTo === currentUserId
				? 'accepted'
				: 'pending'
			: null;
	}
	const category = normalizeTaskCategoryInput(draft.category);
	if (category !== (target.category ?? null)) payload.category = category;
	return payload;
}
