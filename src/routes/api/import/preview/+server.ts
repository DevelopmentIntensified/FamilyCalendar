import type { RequestEvent } from '@sveltejs/kit';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { readJsonObject } from '$lib/server/utils/jsonBody';
import {
	defaultImportDeps,
	runImportPreview,
	type ImportDeps
} from '$lib/server/services/icsImportFlow';
import { importResponse, previewForm } from '$lib/server/services/icsImportApi';

/**
 * POST /api/import/preview `{calendarId, files:[{name, contentBase64}]}`
 * (#292 G17) — step one: parse and describe, write nothing (the page's
 * preview action, same checks and messages).
 */
export const POST = async (
	event: RequestEvent,
	deps: ImportDeps = defaultImportDeps
): Promise<Response> => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(event.request);
	if (!body.ok) return body.response;
	const built = previewForm(body.value);
	if (!built.ok) return built.response;
	return importResponse(await runImportPreview(built.form, auth.user.id, deps));
};
