import type { RequestEvent } from '@sveltejs/kit';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { readJsonObject } from '$lib/server/utils/jsonBody';
import {
	defaultImportDeps,
	runImportUndo,
	type ImportDeps
} from '$lib/server/services/icsImportFlow';
import { importResponse, stepForm } from '$lib/server/services/icsImportApi';

/**
 * POST /api/import/undo `{calendarId, batch:[{id,title,startIso}]}` (#292
 * G17) — step three: remove what that commit added (scoped to you + that
 * calendar; rows edited since are kept and named).
 */
export const POST = async (
	event: RequestEvent,
	deps: ImportDeps = defaultImportDeps
): Promise<Response> => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(event.request);
	if (!body.ok) return body.response;
	return importResponse(await runImportUndo(stepForm(body.value, 'batch'), auth.user.id, deps));
};
