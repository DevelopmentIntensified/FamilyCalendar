/**
 * GET /api/stats (#292 G15) — the /calendar/stats page's data: the counting
 * path, the streak, the instants, today and the family roster.
 */
import { taskStatsEndpoint } from '$lib/domains/tasks/index.server';

export const GET = taskStatsEndpoint.handler;
