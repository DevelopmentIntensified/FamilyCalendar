/**
 * tasks — public isomorphic interface: contract types, pure rules, client api.
 * Other modules import tasks ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */

// The wire shapes, and the request bodies both as sent (…Payload) and as parsed (…Body); the zod schemas live in the contract file.
export type {
	FocusCommandBody,
	FocusCommandWire,
	FocusSessionEndBody,
	FocusSessionStartBody,
	FocusSessionWire,
	TaskCategoryNameBody,
	TaskCategoryWire,
	TaskCreateBody,
	TaskCreatePayload,
	TaskUpdateBody,
	TaskUpdatePayload,
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
export { mergeDayCompletions } from './tasks.list.rules';
export {
	familyBoardOwnerId,
	groupFamilyBoard,
	type FamilyBoardColumn,
	type FamilyBoardGrouping,
	type FamilyBoardRow
} from './tasks.board.rules';

// --- Browser client ----------------------------------------------------------

export { createTasksApi, type TasksApi, type TaskMutationAnswer } from './tasks.api';

// The page state classes (`TasksPageState`, `TaskQuickAddState`,
// `EventTaskChecklistState`) are deliberately NOT re-exported: the only
// consumers are this module's own components, which import their files, while
// re-exporting them made every rules-only consumer (the family board, the day
// dashboard) pull the quick-add parser (`parsing.task.rules`, ~7 KB gzip) into
// its first paint — Rollup did not shake a runed class module out of the entry
// (ADR 0010).

// The page shapes (load data + components) and their rules.
export type {
	TaskPageRow,
	TaskRosterMember,
	TaskCategoryItem,
	TaskSections,
	TaskPageData,
	TaskArchiveEvent,
	TaskArchivePage
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
