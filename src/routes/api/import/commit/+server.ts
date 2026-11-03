import type { RequestEvent } from '@sveltejs/kit';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { readJsonObject } from '$lib/server/utils/jsonBody';
import {
	defaultImportDeps,
	runImportCommit,
	type ImportDeps
} from '$lib/server/services/icsImportFlow';
import { importResponse, stepForm } from '$lib/server/services/icsImportApi';

/**
 * POST /api/import/commit `{calendarId, picked:[<preview item draft>]}`
 * (#292 G17) — step two: write only the picked rows (dedupe re-runs).
 */
export const POST = async (
	event: RequestEvent,
	deps: ImportDeps = defaultImportDeps
): Promise<Response> => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(event.request);
	if (!body.ok) return body.response;
	return importResponse(await runImportCommit(stepForm(body.value, 'picked'), auth.user.id, deps));
};
