import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	defaultImportDeps,
	listImportCalendars,
	runImportCommit,
	runImportPreview,
	runImportUndo,
	type ImportDeps,
	type ImportPreviewItem
} from '$lib/server/services/icsImportFlow';

// The load + the three action bodies live in icsImportFlow (#292 G17) so
// /api/import/* runs the same steps; this file only maps results to forms.

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return { calendars: [] };
	}
	return { calendars: await listImportCalendars(event.locals.user.id) };
};

export const actions: Actions = {
	/**
	 * Step one of two: parse and describe, write nothing. Returns the rows the
	 * commit request will later carry, so the preview cannot drift from the save.
	 */
	preview: async ({ request, locals }, deps: ImportDeps = defaultImportDeps) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const r = await runImportPreview(await request.formData(), locals.user.id, deps);
		return r.ok ? r.data : fail(r.status, { error: r.error });
	},

	/**
	 * Step two: write only the ticked rows. Dedupe re-runs here on purpose —
	 * the calendar can change between preview and commit.
	 */
	commit: async ({ request, locals }, deps: ImportDeps = defaultImportDeps) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const r = await runImportCommit(await request.formData(), locals.user.id, deps);
		return r.ok ? r.data : fail(r.status, { error: r.error });
	},

	/**
	 * Step three, and the only one that removes rows: put back what this
	 * session's commit added (re-scoped to the viewer and the target calendar;
	 * an edited row is kept and named rather than deleted).
	 */
	undo: async ({ request, locals }, deps: ImportDeps = defaultImportDeps) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const r = await runImportUndo(await request.formData(), locals.user.id, deps);
		return r.ok ? r.data : fail(r.status, { error: r.error });
	}
};

export type { ImportDeps, ImportPreviewItem };
