/** GET /api/import — the calendars the viewer may import into (#292 G17). */
import { listImportTargetsEndpoint } from '$lib/domains/calendar/index.server';

export const GET = listImportTargetsEndpoint.handler;
