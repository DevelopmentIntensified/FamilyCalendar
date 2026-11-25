/**
 * tasks — public server interface: the use-case services, the `/api` handlers
 * and the `family` port this module implements.
 *
 * Tasks is rank 9, so it calls `identity`, `family`, `alerts`, `calendar` and
 * `parsing` directly through their entries; the one port it OWNS is
 * `MemberTasksPort.unassignMemberTasks`, attached in
 * `src/lib/app/ports.server.ts` and writing through the ctx family hands it.
 *
 * Doc: ./README.md#public-interface
 */

// --- Guest merge (access) -----------------------------------------------------

/** `access`' guest merge reads the counts and moves them inside its own transaction. */
export {
	moveGuestTasks,
	countGuestTasks,
	type MoveGuestTasksInput
} from './tasks.guest.service.server';

// --- Port this module implements ---------------------------------------------

export { unassignMemberTasks } from './tasks.items.service.server';

// --- Services -----------------------------------------------------------------

export {
	listTasks,
	listDueTasks,
	listTaskSections,
	listFamilyTasks,
	createTask,
	updateTask,
	deleteTask,
	clearCompletedTasks,
	type TaskWithTagsRow,
	type TaskListRow,
	type TaskSectionRow,
	type TaskDueWindowInput,
	type TaskFamilyBoardRows,
	type TaskListInput
} from './tasks.items.service.server';
export type { TaskUpdatedRow } from './tasks.completion.service.server';
export {
	sweepOverdueTaskCursors,
	type TaskCursorSweepReport,
	type TaskCursorSweepLimits
} from './tasks.cursor.sweep.service.server';
export {
	listTaskCategories,
	addTaskCategory,
	renameTaskCategory,
	removeTaskCategory
} from './tasks.categories.service.server';
export {
	listFocusCommands,
	issueFocusCommand,
	ackFocusCommand,
	startFocusSession,
	endFocusSession,
	discardFocusSession,
	absorbFocusSession,
	listUnabsorbedFocusSessions,
	type FocusCommandInput,
	type FocusSessionStartInput,
	type FocusSessionEndInput
} from './tasks.focus.service.server';
export {
	getTaskStats,
	listCompletionInstants,
	listDayCompletions,
	getStatsPage,
	TASK_STATS_RECENT_LIMIT,
	TASK_STATS_PEOPLE_LIMIT,
	TASK_STATS_DONE_BY_LIMIT,
	TASK_STATS_INSTANT_LIMIT,
	type TaskDayCompletion
} from './tasks.stats.service.server';
export {
	resolveTaskQuickAdd,
	type TaskQuickAddInput,
	type TaskQuickAddDraft
} from './tasks.quickadd.service.server';

// --- HTTP handlers ------------------------------------------------------------

export {
	listTasksEndpoint,
	createTaskEndpoint,
	taskSectionsEndpoint,
	clearCompletedTasksEndpoint,
	listTaskCategoriesEndpoint,
	createTaskCategoryEndpoint,
	renameTaskCategoryEndpoint,
	deleteTaskCategoryEndpoint,
	taskStatsEndpoint
} from './tasks.http.server';
export { updateTaskEndpoint, deleteTaskEndpoint } from './tasks.update.http.server';
export {
	listFocusCommandsEndpoint,
	issueFocusCommandEndpoint,
	ackFocusCommandEndpoint,
	listFocusSessionsEndpoint,
	startFocusSessionEndpoint,
	endFocusSessionEndpoint,
	discardFocusSessionEndpoint,
	absorbFocusSessionEndpoint
} from './tasks.focus.http.server';

// --- Page loads ---------------------------------------------------------------

export { tasksPageLoad } from './tasks.http.server';
export { statsPageLoad } from './tasks.http.server';
export { archiveEndpoint, archivePageLoad } from './tasks.archive.http.server';
