/**
 * Task categories (#280), synced by name with TaskFocus. GET lists them, POST
 * adds one idempotently (case-insensitive, the list's spelling wins).
 */
import {
	createTaskCategoryEndpoint,
	listTaskCategoriesEndpoint
} from '$lib/domains/tasks/index.server';

export const GET = listTaskCategoriesEndpoint.handler;
export const POST = createTaskCategoryEndpoint.handler;
