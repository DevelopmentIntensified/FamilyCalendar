/**
 * GET /api/events/[id]/ics — one Event (or one occurrence) as a `text/calendar`
 * attachment (#028). Lives in calendar's http handlers.
 */
import { exportEventIcsEndpoint } from '$lib/domains/calendar/index.server';

export const GET = exportEventIcsEndpoint.handler;
