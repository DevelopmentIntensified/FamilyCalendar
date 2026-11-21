/**
 * PUT /api/tasks/[id] — the body-dispatch route (undo, skip, toggle, patch);
 * DELETE /api/tasks/[id] — delete or archive. Both wiring-only.
 */
import { deleteTaskEndpoint, updateTaskEndpoint } from '$lib/domains/tasks/index.server';

export const PUT = updateTaskEndpoint.handler;
export const DELETE = deleteTaskEndpoint.handler;
