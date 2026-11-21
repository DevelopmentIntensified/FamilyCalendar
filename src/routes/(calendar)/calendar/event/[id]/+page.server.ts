import { calendarEventDetailPage } from '$lib/domains/calendar/index.server';

/** `/calendar/event/[id]` — signed in; 404/403 are the service's own refusals. */
export const load = calendarEventDetailPage;
