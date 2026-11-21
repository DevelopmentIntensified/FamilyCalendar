/**
 * tasks — public isomorphic interface: contract types, pure rules, client api.
 * Other modules import tasks ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */

// The wire shapes and request-body types (the zod schemas live in the contract file).
export type {
	FocusCommandBody,
	FocusCommandWire,
	FocusSessionEndBody,
	FocusSessionStartBody,
	FocusSessionWire,
	TaskCategoryNameBody,
	TaskCategoryWire,
	TaskCreateBody,
	TaskUpdateBody,
	TaskWire,
	TaskWithTagsWire
} from './tasks.contract';

// The pure rules other modules call.
export {
	canMutateTask,
	nextAssignmentPatch,
	normalizeTags,
	normalizeTaskPriority,
	normalizeTaskVisibility
} from './tasks.task.rules';
export { nextCursorDue } from './tasks.cursor.rules';
export { computeWeeklyStreak } from './tasks.stats.rules';
export { rankTasks } from './tasks.ranking.rules';
