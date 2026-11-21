/** POST /api/import/preview — .ics parse → preview, writes nothing (#292 G17). */
import { previewImportEndpoint } from '$lib/domains/calendar/index.server';

export const POST = previewImportEndpoint.handler;
