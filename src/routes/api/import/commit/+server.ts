/** POST /api/import/commit — write only the ticked rows (#292 G17). */
import { commitImportEndpoint } from '$lib/domains/calendar/index.server';

export const POST = commitImportEndpoint.handler;
