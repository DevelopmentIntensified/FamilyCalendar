/**
 * GET /api/tasks/sections — the /calendar/tasks page's My tasks / To accept /
 * Requested queues, with a warning label per leg that failed.
 */
import { taskSectionsEndpoint } from '$lib/domains/tasks/index.server';

export const GET = taskSectionsEndpoint.handler;
