/**
 * DELETE /api/tasks/completed — archives the caller's own completed rows so
 * stats and the streak keep their history.
 */
import { clearCompletedTasksEndpoint } from '$lib/domains/tasks/index.server';

export const DELETE = clearCompletedTasksEndpoint.handler;
