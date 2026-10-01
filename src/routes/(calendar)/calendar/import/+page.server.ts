import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { calendars, events } from '$lib/server/db/schema';
import { eq, and, or, inArray } from 'drizzle-orm';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { parseIcs, type IcsEventDraft } from '$lib/server/services/icsImportService';
import {
	buildPreview,
	coerceDrafts,
	coerceUndoBatch,
	dedupeKey,
	defaultSelection,
	planCommit,
	planUndo,
	type ImportedEventRef,
	type ImportPreviewItem,
	type UndoCandidate
} from '$lib/server/services/icsImportPreview';
import { createEvent } from '$lib/server/db/actions/events';
import { getUserZone } from '$lib/server/utils/userTimezone';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return { calendars: [] };
	}
	const userId = event.locals.user.id;
	const userCals = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
	let list = userCals.map((c) => ({ id: c.id, name: 'Personal Calendar' }));

	const memberFamilyId = await getUserFamilyId(userId);
	if (memberFamilyId) {
		const famCals = await db.select().from(calendars).where(eq(calendars.familyId, memberFamilyId));
		list = [...list, ...famCals.map((c) => ({ id: c.id, name: 'Family Calendar' }))];
	}

	return { calendars: list };
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** The owner-ish name a calendar is shown by, matching the load's labels. */
function calendarName(calendarId: string, ownerId: string, familyId: string | null): string {
	return familyId && familyId !== ownerId ? 'Family Calendar' : 'Personal Calendar';
}

/** Dedupe keys already on a calendar: lowercased title + exact start. */
async function realExistingKeys(calendarId: string): Promise<string[]> {
	const rows = await db
		.select({ title: events.title, start: events.start })
		.from(events)
		.where(eq(events.calendarId, calendarId));
	return rows.map((r) => dedupeKey(r.title, new Date(r.start).toISOString()));
}

/** Ownership: the calendar must belong to the viewer or their family. */
async function realCalendarIsOwned(
	calendarId: string,
	userId: string,
	familyId: string | null
): Promise<boolean> {
	const [targetCal] = await db
		.select({ id: calendars.id, ownerId: calendars.ownerId, familyId: calendars.familyId })
		.from(calendars)
		.where(
			and(
				eq(calendars.id, calendarId),
				familyId
					? or(eq(calendars.ownerId, userId), eq(calendars.familyId, familyId))
					: eq(calendars.ownerId, userId)
			)
		);
	return Boolean(targetCal);
}

/**
 * The rows an undo batch may touch: the given ids, restricted to this viewer
 * AND to the calendar the import wrote into. An id that fails either test
 * simply never comes back, so a forged or stale batch cannot reach a row the
 * viewer did not write there.
 */
async function realUndoCandidates(
	ids: string[],
	userId: string,
	calendarId: string
): Promise<UndoCandidate[]> {
	if (ids.length === 0) return [];
	const rows = await db
		.select({ id: events.id, title: events.title, start: events.start })
		.from(events)
		.where(
			and(inArray(events.id, ids), eq(events.ownerId, userId), eq(events.calendarId, calendarId))
		);
	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		startIso: new Date(r.start).toISOString()
	}));
}

/**
 * Delete the batch under the same predicate the read used — owner and calendar
 * both have to match. Mirrors go with their master in the same statement pair,
 * the same reason `deleteEventInScope` does it.
 */
async function realDeleteImportedEvents(
	ids: string[],
	userId: string,
	calendarId: string
): Promise<number> {
	if (ids.length === 0) return 0;
	const removed = await db
		.delete(events)
		.where(
			and(inArray(events.id, ids), eq(events.ownerId, userId), eq(events.calendarId, calendarId))
		)
		.returning({ id: events.id });
	await db.delete(events).where(inArray(events.mirrorOf, ids));
	return removed.length;
}

/**
 * Collaborators the import actions need, injectable so tests pass fakes through
 * a real seam instead of mocking modules. The parser stays real — it is part of
 * what the preview is trusted to describe.
 */
export interface ImportDeps {
	parseIcs: (text: string) => IcsEventDraft[];
	getUserFamilyId: (userId: string) => Promise<string | null>;
	calendarIsOwned: (
		calendarId: string,
		userId: string,
		familyId: string | null
	) => Promise<boolean>;
	listExistingKeys: (calendarId: string) => Promise<string[]>;
	createEvent: typeof createEvent;
	getUserZone: (userId: string) => Promise<string | undefined>;
	/** Read back the rows a batch names, scoped to that viewer and calendar. */
	loadUndoCandidates: (
		ids: string[],
		userId: string,
		calendarId: string
	) => Promise<UndoCandidate[]>;
	/** Remove exactly those rows, under the same scope. Returns rows deleted. */
	deleteImportedEvents: (ids: string[], userId: string, calendarId: string) => Promise<number>;
}

const defaultDeps: ImportDeps = {
	parseIcs,
	getUserFamilyId,
	calendarIsOwned: realCalendarIsOwned,
	listExistingKeys: realExistingKeys,
	createEvent,
	getUserZone,
	loadUndoCandidates: realUndoCandidates,
	deleteImportedEvents: realDeleteImportedEvents
};

/** True for non-empty strings (form fields that must carry a value). */
function isNonEmptyString(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0;
}

/** The shared preamble: signed in, a chosen calendar, and the calendar is theirs. */
async function resolveTarget(
	form: FormData,
	userId: string,
	deps: ImportDeps
): Promise<{ calendarId: string; name: string } | { error: string; status: number }> {
	const calendarId = form.get('calendarId');
	if (!isNonEmptyString(calendarId))
		return { status: 400, error: 'Choose a calendar to import into.' };
	const familyId = await deps.getUserFamilyId(userId);
	if (!(await deps.calendarIsOwned(calendarId, userId, familyId))) {
		return { status: 403, error: 'That calendar is not yours to import into.' };
	}
	return { calendarId, name: calendarName(calendarId, userId, familyId) };
}

/** A parse that found nothing says why, rather than dying on a bare 400. */
const EMPTY_PARSE_ERROR =
	'No events found in that file. An .ics export wraps each event in BEGIN:VEVENT with a ' +
	'SUMMARY and a DTSTART — check you picked the .ics from inside the export, not the whole zip.';

export const actions: Actions = {
	/**
	 * Step one of two: parse and describe, write nothing. Returns the rows the
	 * commit request will later carry, so the preview cannot drift from the save.
	 */
	preview: async ({ request, locals }, deps: ImportDeps = defaultDeps) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const userId = locals.user.id;

		const form = await request.formData();
		const target = await resolveTarget(form, userId, deps);
		if ('error' in target) return fail(target.status, { error: target.error });

		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Choose an .ics file to import.' });
		}
		if (file.size > MAX_FILE_BYTES) {
			return fail(400, { error: 'File is larger than 5 MB.' });
		}

		let text: string;
		try {
			text = await file.text();
		} catch {
			return fail(400, { error: 'Could not read that file.' });
		}

		const drafts = deps.parseIcs(text);
		if (drafts.length === 0) return fail(400, { error: EMPTY_PARSE_ERROR });

		const existing = new Set(await deps.listExistingKeys(target.calendarId));
		const zone = (await deps.getUserZone(userId)) ?? 'utc';
		const { items, duplicates } = buildPreview(drafts, existing, zone);

		return {
			preview: {
				calendarId: target.calendarId,
				calendarName: target.name,
				fileName: file.name,
				items,
				duplicates,
				defaultSelection: [...defaultSelection(items)]
			}
		};
	},

	/**
	 * Step two: write only the ticked rows. Dedupe re-runs here on purpose —
	 * the calendar can change between preview and commit.
	 */
	commit: async ({ request, locals }, deps: ImportDeps = defaultDeps) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const userId = locals.user.id;

		const form = await request.formData();
		const target = await resolveTarget(form, userId, deps);
		if ('error' in target) return fail(target.status, { error: target.error });

		const raw = form.get('picked');
		if (!isNonEmptyString(raw)) return fail(400, { error: 'Pick the events you want to add.' });

		let posted: unknown;
		try {
			posted = JSON.parse(raw);
		} catch {
			return fail(400, { error: 'That selection could not be read — preview the file again.' });
		}
		const selected = coerceDrafts(posted);
		if (selected.length === 0) {
			return fail(400, { error: 'Tick at least one event before importing.' });
		}

		const existing = new Set(await deps.listExistingKeys(target.calendarId));
		const { toWrite, skippedDuplicates } = planCommit(selected, existing);

		let imported = 0;
		const failed: string[] = [];
		// What landed, by id — the batch an undo reverses. There is no import-batch
		// column on the events table, so this is the only record of the batch.
		const importedEvents: ImportedEventRef[] = [];
		for (const draft of toWrite) {
			try {
				const created = await deps.createEvent(
					{
						calendarId: target.calendarId,
						ownerId: userId,
						title: draft.title,
						start: draft.startIso,
						end: draft.endIso,
						description: draft.description,
						location: draft.location,
						allDay: draft.allDay,
						recurrenceFrequency: draft.recurrenceFrequency,
						recurrenceInterval: draft.recurrenceInterval,
						recurrenceByDay: draft.recurrenceByDay,
						recurrenceCount: draft.recurrenceCount,
						recurrenceUntil: draft.recurrenceUntil,
						reminderMinutes: null
					},
					userId
				);
				imported++;
				if (created?.id) {
					importedEvents.push({
						id: created.id,
						title: draft.title,
						startIso: draft.startIso
					});
				}
			} catch (e) {
				console.error('Failed to import event:', e);
				failed.push(draft.title);
			}
		}

		return {
			calendarId: target.calendarId,
			calendarName: target.name,
			imported,
			selected: selected.length,
			skipped: selected.length - imported,
			skippedDuplicates,
			failed,
			importedEvents
		};
	},

	/**
	 * Step three, and the only one that removes rows: put back what this
	 * session's commit added. The batch arrives from the success screen (there
	 * is no batch id in the database), is re-scoped to the viewer and the target
	 * calendar, and a row the user has edited since is kept and named rather
	 * than deleted.
	 */
	undo: async ({ request, locals }, deps: ImportDeps = defaultDeps) => {
		if (!locals.user) return fail(401, { error: 'Not signed in' });
		const userId = locals.user.id;

		const form = await request.formData();
		const target = await resolveTarget(form, userId, deps);
		if ('error' in target) return fail(target.status, { error: target.error });

		const raw = form.get('batch');
		if (!isNonEmptyString(raw)) {
			return fail(400, { error: 'Nothing to undo — import a file first.' });
		}

		let posted: unknown;
		try {
			posted = JSON.parse(raw);
		} catch {
			return fail(400, { error: 'That undo could not be read — import the file again.' });
		}
		const batch = coerceUndoBatch(posted);
		if (batch.length === 0) {
			return fail(400, { error: 'Nothing to undo — import a file first.' });
		}

		const live = await deps.loadUndoCandidates(
			batch.map((r) => r.id),
			userId,
			target.calendarId
		);
		const plan = planUndo(batch, live);
		const removed =
			plan.remove.length > 0
				? await deps.deleteImportedEvents(plan.remove, userId, target.calendarId)
				: 0;

		return {
			calendarName: target.name,
			removed,
			kept: plan.changed,
			alreadyGone: plan.missing.length
		};
	}
};

export type { ImportPreviewItem };
