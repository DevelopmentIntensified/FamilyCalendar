/**
 * Shared task-list ordering for the My Tasks and Family-board pages.
 * Pure + deterministic so both lists sort identically.
 */
import type { TaskPriority } from '$lib/server/db/actions/dashboard';

export type TaskSortKey = 'due' | 'priority' | 'created' | 'title';

export interface SortableTask {
	title: string;
	dueDate?: string | Date | null;
	createdAt?: string | Date | number | null;
	priority?: string | null;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 };

function time(value: string | Date | number | null | undefined): number {
	if (!value) return 0;
	const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
	return Number.isNaN(t) ? 0 : t;
}

/**
 * Ascending comparator for the open-task list.
 *  - due:      overdue pinned first, then soonest, undated tasks last
 *  - priority: high → normal → low (missing = normal)
 *  - created:  newest first
 *  - title:    case-insensitive A–Z
 */
export function sortTasks(a: SortableTask, b: SortableTask, key: TaskSortKey): number {
	if (key === 'priority') {
		const pa = PRIORITY_ORDER[a.priority ?? 'normal'] ?? 1;
		const pb = PRIORITY_ORDER[b.priority ?? 'normal'] ?? 1;
		return pa - pb;
	}
	if (key === 'title') {
		return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
	}
	if (key === 'created') {
		return time(b.createdAt) - time(a.createdAt);
	}
	const nowMs = Date.now();
	const aOverdue = a.dueDate ? time(a.dueDate) < nowMs : false;
	const bOverdue = b.dueDate ? time(b.dueDate) < nowMs : false;
	if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
	const ta = a.dueDate ? time(a.dueDate) : Number.POSITIVE_INFINITY;
	const tb = b.dueDate ? time(b.dueDate) : Number.POSITIVE_INFINITY;
	return ta - tb;
}

/** Completed lists always show most-recently-completed first. */
export function sortByCompletedDesc<T extends { completedAt?: string | Date | null }>(
	a: T,
	b: T
): number {
	return time(b.completedAt) - time(a.completedAt);
}

export type { TaskPriority };