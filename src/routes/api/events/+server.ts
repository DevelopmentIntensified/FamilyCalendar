/**
 * GET /api/events?from&to — the ranged read (#082); POST /api/events — create
 * (#292 G2). Both live in calendar's http handlers.
 */
import { createEventEndpoint, listEventsEndpoint } from '$lib/domains/calendar/index.server';

export const GET = listEventsEndpoint.handler;
export const POST = createEventEndpoint.handler;
