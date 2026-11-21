/**
 * calendar import http: the four `/api` handlers over the .ics import flow
 * (picker, preview, commit, undo).
 *
 * The stem is frozen by `calendar.import.http.db.test.ts` (R13). These routes
 * are the one place the module still adapts a JSON body into the flow's input:
 * legacy posted `{calendarId, files:[{name, contentBase64}]}` and the adapter
 * (`icsImportApi.previewForm`) decoded each entry, sliced the list to the cap
 * and refused a missing/invalid base64 field before the flow ran. Nothing
 * else changes: the flow owns every choice, selection and batch message, and
 * a body that is not a JSON object is `400 {"error":"Invalid JSON"}` (the
 * contract's object-level error, exactly `readJsonObject`).
 *
 * Doc: ./README.md#public-interface
 */
import { invalid } from '$lib/kernel/errors/appError';
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import {
	CALENDAR_COPY,
	CalendarImportCommitBody,
	CalendarImportPreviewBody,
	CalendarImportUndoBody
} from './calendar.contract';
import {
	MAX_IMPORT_FILES,
	commitImport,
	listImportTargets,
	previewImport,
	undoImport,
	type CalendarImportUpload
} from './calendar.ics.service.server';

/** Base64 as legacy accepted it: the URL alphabet plus CR/LF, at most two `=`. */
const BASE64 = /^[A-Za-z0-9+/\r\n]*={0,2}$/;

/**
 * The posted files as the flow's uploads. Mirror of legacy `previewForm`: a
 * non-array `files` and an entry without base64 text are the route's own 400s;
 * the list is sliced to one past the cap so the flow can answer its message
 * without decoding an unbounded payload.
 */
function uploadsOf(files: unknown): CalendarImportUpload[] {
	if (files !== undefined && !Array.isArray(files)) {
		throw invalid(CALENDAR_COPY.importFilesNotArray);
	}
	const uploads: CalendarImportUpload[] = [];
	for (const entry of (files ?? []).slice(0, MAX_IMPORT_FILES + 1)) {
		// SAFETY: a posted entry is untyped JSON; every field is checked below.
		const file = (entry ?? {}) as { readonly name?: unknown; readonly contentBase64?: unknown };
		const contentBase64 = file.contentBase64;
		if (typeof contentBase64 !== 'string' || !BASE64.test(contentBase64)) {
			throw invalid(CALENDAR_COPY.importFileNeedsBase64);
		}
		const fileName =
			typeof file.name === 'string' && file.name.trim() ? file.name.trim() : 'calendar.ics';
		const bytes = Buffer.from(contentBase64, 'base64');
		uploads.push({
			fileName,
			size: bytes.byteLength,
			readText: async () => bytes.toString('utf8')
		});
	}
	return uploads;
}

/**
 * The posted `calendarId` as the flow received it from the legacy FormData
 * adapter: `setField` JSON-stringified every non-string, so a number or object
 * reached the target check as text and answered its 403 rather than "choose a
 * calendar". `undefined`/`null` stayed absent.
 */
function calendarIdOf(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	return typeof value === 'string' ? value : JSON.stringify(value);
}

/** `GET /api/import`: the calendars the viewer may import into, labelled like the page. */
export const listImportTargetsEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => ok(await listImportTargets(ctx, actor))
});

/** `POST /api/import/preview`: step one — parse and describe, write nothing. */
export const previewImportEndpoint = endpoint({
	auth: 'user',
	body: CalendarImportPreviewBody,
	handle: async ({ ctx, actor, body }) =>
		ok(
			await previewImport(ctx, actor, {
				calendarId: calendarIdOf(body.calendarId),
				uploads: uploadsOf(body.files)
			})
		)
});

/** `POST /api/import/commit`: step two — write only the ticked rows (dedupe re-runs). */
export const commitImportEndpoint = endpoint({
	auth: 'user',
	body: CalendarImportCommitBody,
	handle: async ({ ctx, actor, body }) =>
		ok(
			await commitImport(ctx, actor, {
				calendarId: calendarIdOf(body.calendarId),
				picked: body.picked
			})
		)
});

/** `POST /api/import/undo`: step three — remove what that commit added, viewer-scoped. */
export const undoImportEndpoint = endpoint({
	auth: 'user',
	body: CalendarImportUndoBody,
	handle: async ({ ctx, actor, body }) =>
		ok(
			await undoImport(ctx, actor, {
				calendarId: calendarIdOf(body.calendarId),
				batch: body.batch
			})
		)
});
