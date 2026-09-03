/**
 * Task Priority vocabulary — neutral home for the user-set importance
 * label on a Task (`'low' | 'normal' | 'high'`, default `'normal'`).
 *
 * This lived in the Day Dashboard selectors (`dashboard.ts`), but Task
 * write routes validate against it too — a Dashboard module must not own
 * an interface Task writers depend on. Both sides import from here;
 * `dashboard.ts` re-exports for pre-existing importers.
 */

/** User-set importance label on a Task. Default `'normal'`. */
export type TaskPriority = 'low' | 'normal' | 'high';

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;

/** Default when no (or no valid) priority is supplied. */
export const DEFAULT_TASK_PRIORITY: TaskPriority = 'normal';

/** Ranking weight: high → normal → low. */
export const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

/** Type guard for raw input (e.g. request bodies). */
export function isTaskPriority(value: unknown): value is TaskPriority {
	return (
		typeof value === 'string' && (TASK_PRIORITIES as readonly string[]).includes(value)
	);
}

/** Valid priority as-is, otherwise the default. Never throws. */
export function normalizeTaskPriority(value: unknown): TaskPriority {
	return isTaskPriority(value) ? value : DEFAULT_TASK_PRIORITY;
}
