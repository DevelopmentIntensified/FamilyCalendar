/**
 * JSON adapters for the .ics import flow (#292 G17). The app posts JSON;
 * these build the SAME FormData the /calendar/import page posts and hand it
 * to icsImportFlow, so validation and messages are the page's own.
 */
import { json } from '@sveltejs/kit';
import { MAX_FILES, type ImportResult } from '$lib/server/services/icsImportFlow';

/** A JSON body field → its FormData twin (arrays/objects as JSON text). */
function setField(form: FormData, key: string, value: unknown) {
	if (value === undefined || value === null) return;
	form.set(key, typeof value === 'string' ? value : JSON.stringify(value));
}

const BASE64 = /^[A-Za-z0-9+/\r\n]*={0,2}$/;

/**
 * `{calendarId, files:[{name, contentBase64}]}` → the preview FormData.
 * A malformed entry is a 400 here; size/count/parse checks stay in the flow.
 */
export function previewForm(
	body: Record<string, unknown>
): { ok: true; form: FormData } | { ok: false; response: Response } {
	const form = new FormData();
	setField(form, 'calendarId', body.calendarId);
	const files = body.files;
	if (files !== undefined && !Array.isArray(files)) {
		return { ok: false, response: json({ error: 'files must be an array' }, { status: 400 }) };
	}
	// Over the cap: decode nothing; the flow answers with its own message.
	const list = (files ?? []).slice(0, MAX_FILES + 1);
	for (const entry of list) {
		const e = (entry ?? {}) as Record<string, unknown>;
		if (typeof e.contentBase64 !== 'string' || !BASE64.test(e.contentBase64)) {
			return {
				ok: false,
				response: json({ error: 'Each file needs contentBase64 (base64 text)' }, { status: 400 })
			};
		}
		const name = typeof e.name === 'string' && e.name.trim() ? e.name.trim() : 'calendar.ics';
		const bytes = Buffer.from(e.contentBase64, 'base64');
		form.append('files', new File([bytes], name, { type: 'text/calendar' }));
	}
	return { ok: true, form };
}

/** `{calendarId, picked}` / `{calendarId, batch}` → the commit / undo FormData. */
export function stepForm(body: Record<string, unknown>, key: 'picked' | 'batch'): FormData {
	const form = new FormData();
	setField(form, 'calendarId', body.calendarId);
	setField(form, key, body[key]);
	return form;
}

export function importResponse(r: ImportResult<unknown>): Response {
	return r.ok ? json(r.data) : json({ error: r.error }, { status: r.status });
}
