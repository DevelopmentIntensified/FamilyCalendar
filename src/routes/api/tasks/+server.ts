/**
 * GET /api/tasks — the caller's list (or the parent Event's rows for
 * `?eventId=`); POST /api/tasks — create. Both live in tasks' http handlers.
 */
import { createTaskEndpoint, listTasksEndpoint } from '$lib/domains/tasks/index.server';

export const GET = listTasksEndpoint.handler;
export const POST = createTaskEndpoint.handler;
