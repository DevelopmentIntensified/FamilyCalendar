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

// --- Browser client and UI state ---------------------------------------------

export { createTasksApi, type TasksApi, type TaskMutationAnswer } from './tasks.api';
export { TasksPageState, FOCUS_SETTLE_MS, type TasksStateOptions } from './tasks.page.state.svelte';
export {
	TaskQuickAddState,
	type TaskQuickAddStateOptions
} from './tasks.quickadd.state.svelte';
export { EventTaskChecklistState, type TaskChecklistOptions } from './tasks.checklist.state.svelte';

// The page shapes (load data + components) and their rules.
export type {
	TaskPageRow,
	TaskRosterMember,
	TaskCategoryItem,
	TaskSections,
	TaskPageData
} from './tasks.contract';
export {
	TASK_CHIPS,
	TASK_OWNER_VIEWS,
	TASK_SORT_KEYS,
	TASK_TIME_FILTERS,
	matchesTaskChip,
	matchesTaskSearch,
	matchesTaskTagFilter,
	sortTaskRows,
	splitTasksByRecurrence,
	taskBucketCounts,
	taskInOwnerView,
	taskLateChip,
	taskMemberName,
	taskRowFromWire,
	taskUrgencyBucket,
	countTasksCompletedThisWeek,
	type TaskChip,
	type TaskOwnerView,
	type TaskSortKey,
	type TaskTimeFilter,
	type TaskUrgencyBucket
} from './tasks.list.rules';
export {
	formatTaskDue,
	taskFocusText,
	taskMetaSlots,
	taskPriorityDot,
	taskPriorityLabel,
	taskRecurringCompleteText,
	taskRecurringSkipText,
	taskRecurrenceLabel,
	taskShortDate,
	taskFreqNoun,
	type TaskFeedbackRow,
	type TaskMetaSlot
} from './tasks.display.rules';
export {
	buildTaskEditPayload,
	parseTaskEditTags,
	taskCategoryNameError,
	taskIsoToInput,
	type TaskEditDraft,
	type TaskEditTarget
} from './tasks.editor.rules';
export {
	buildTaskQuickAddBody,
	splitTaskRecords,
	taskQuickAddRefusal,
	type TaskRecord,
	type TaskQuickAddFallbacks
} from './tasks.quickadd.rules';
