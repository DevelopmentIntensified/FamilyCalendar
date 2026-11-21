/** GET /api/calendars — the viewer's calendars, personal first (#292 G2). */
import { listCalendarsEndpoint } from '$lib/domains/calendar/index.server';

export const GET = listCalendarsEndpoint.handler;
