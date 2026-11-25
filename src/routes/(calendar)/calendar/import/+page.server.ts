import { calendarImportPage } from '$lib/domains/calendar/index.server';

/** `/calendar/import` — the calendars a viewer may import into (empty when signed out). */
export const load = calendarImportPage;
