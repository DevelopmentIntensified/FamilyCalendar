/**
 * POST /api/events/bulk — delete / calendar / location / attendants / smart
 * over the selected events. Lives in calendar's http handlers.
 */
import { bulkEditEventsEndpoint } from '$lib/domains/calendar/index.server';

export const POST = bulkEditEventsEndpoint.handler;
