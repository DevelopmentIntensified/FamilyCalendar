// Public type/shape bag for task consumers (issue #113): shapes live here
// so callers never import an implementation module to get a type.

import { TASK_VISIBILITIES, type Task, type TaskVisibility } from '$lib/server/db/schema';

// Re-exported so the API routes import the visibility enum from this
// actions module (the seam they already mock) instead of schema directly.
export { TASK_VISIBILITIES };

export const TASK_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type TaskFrequency = (typeof TASK_FREQUENCIES)[number];

/** True when the value is one of the supported visibility values. */
export function isTaskVisibility(value: unknown): value is TaskVisibility {
	return typeof value === 'string' && TASK_VISIBILITIES.some((v) => v === value);
}

/**
 * Task scoping (issue 019): accept only the supported visibility values;
 * anything else (bad input, legacy null) falls back to 'public', matching
 * the column default and the normalizeTaskPriority pattern.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- exported boundary parser: unknown input IS its contract; routes feed it raw request-body fields.
export function normalizeTaskVisibility(value: unknown): TaskVisibility {
	return isTaskVisibility(value) ? value : 'public';
}

/**
 * A task plus its tag names (normalized, sorted).
 * List queries (getTasksForUser/getTasksForFamily) also attach join
 * attribution, so consumers of those rows may read the optional fields.
 */
export type TaskWithTags = Task & {
	tags: string[];
	assigneeFirstName?: string | null;
	assigneeLastName?: string | null;
	creatorFirstName?: string | null;
	eventTitle?: string | null;
	eventStart?: string | null;
	/**
	 * Calendar of the linked event (#069). Tasks have no calendar column of
	 * their own, so a Task is filtered by its parent Event's calendar; null
	 * when the Task stands alone. Read from the existing events LEFT JOIN —
	 * no extra query.
	 */
	eventCalendarId?: string | null;
};


/** Assignment-only patch for task reassignment responses. */
export type AssignmentPatch = {
	assignedTo?: string | null;
	assignmentStatus?: string | null;
};
