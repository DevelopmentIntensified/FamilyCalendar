import { calendarPrintPage } from '$lib/domains/calendar/index.server';

/** `/calendar/print` — the printed month; signed-out → 302 `/login`. */
export const load = calendarPrintPage;
