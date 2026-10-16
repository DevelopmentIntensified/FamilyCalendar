// Barrel for the six task modules (issue #113): the PUBLIC export surface
// is unchanged — loaders and api routes keep importing from
// '$lib/server/db/actions/tasks'.

export {
	TASK_VISIBILITIES,
	TASK_FREQUENCIES,
	isTaskVisibility,
	normalizeTaskVisibility,
	type TaskFrequency,
	type TaskWithTags,
	type AssignmentPatch
} from './types';
export {
	advanceCursor,
	needsOverduePin,
	advanceTaskToNext,
	undoRecurringCompletion,
	syncRecurringCursors
} from './cursor';
export { normalizeTags } from './tags';
export { isFamilyMember, canMutateTask } from './auth';
export {
	createTask,
	updateTask,
	applyToggle,
	toggleTaskComplete,
	toggleTaskCompleteFamily,
	deleteTask,
	deleteCompletedTasks
} from './mutations';
export {
	getTasksForUser,
	getTasksForEvent,
	getTasksForFamily,
	getMyTasks,
	getPublicTasksForFamily
} from './queries';
export {
	getPendingAssignments,
	getRequestedByMe,
	nonOwnerAssignmentPatch,
	isValidAssignee,
	updateTaskInFamily
} from './assignment';
