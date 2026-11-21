/**
 * One task category (#280): PATCH renames and re-tags the caller's Tasks,
 * DELETE removes it and clears the name from them. Only the caller's own rows.
 */
import {
	deleteTaskCategoryEndpoint,
	renameTaskCategoryEndpoint
} from '$lib/domains/tasks/index.server';

export const PATCH = renameTaskCategoryEndpoint.handler;
export const DELETE = deleteTaskCategoryEndpoint.handler;
