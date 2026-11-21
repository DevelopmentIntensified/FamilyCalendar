/**
 * PUT /api/events/[id] — a whole-series edit or a scope-`this` Exception
 * Override; DELETE — cancel one occurrence or remove the series. Both live in
 * calendar's http handlers.
 */
import { deleteEventEndpoint, updateEventEndpoint } from '$lib/domains/calendar/index.server';

export const PUT = updateEventEndpoint.handler;
export const DELETE = deleteEventEndpoint.handler;
