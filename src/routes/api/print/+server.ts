/** GET /api/print?year=&month= — the printable month grid (#292 G18). */
import { printMonthEndpoint } from '$lib/domains/calendar/index.server';

export const GET = printMonthEndpoint.handler;
