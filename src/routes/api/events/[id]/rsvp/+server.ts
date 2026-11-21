/**
 * GET /api/events/[id]/rsvp — the attendance read; POST — the viewer's answer
 * or a named-guest invite. Both live in calendar's http handlers.
 */
import { getEventRsvpEndpoint, setEventRsvpEndpoint } from '$lib/domains/calendar/index.server';

export const GET = getEventRsvpEndpoint.handler;
export const POST = setEventRsvpEndpoint.handler;
