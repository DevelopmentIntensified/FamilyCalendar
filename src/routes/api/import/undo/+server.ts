/** POST /api/import/undo — remove what that commit added (#292 G17). */
import { undoImportEndpoint } from '$lib/domains/calendar/index.server';

export const POST = undoImportEndpoint.handler;
