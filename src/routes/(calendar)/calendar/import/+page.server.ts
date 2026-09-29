import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { calendars, events } from '$lib/server/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { parseIcs, type IcsEventDraft } from '$lib/server/services/icsImportService';
import {
	buildPreview,
	coerceDrafts,
	dedupeKey,
	defaultSelection,
	planCommit,
	type ImportPreviewItem
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
}

const defaultDeps: ImportDeps = {
	parseIcs,
	getUserFamilyId,
	calendarIsOwned: realCalendarIsOwned,
	listExistingKeys: realExistingKeys,
	createEvent,
	getUserZone
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
		for (const draft of toWrite) {
			try {
				await deps.createEvent(
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
			} catch (e) {
				console.error('Failed to import event:', e);
				failed.push(draft.title);
			}
		}

		return {
			calendarName: target.name,
			imported,
			selected: selected.length,
			skipped: selected.length - imported,
			skippedDuplicates,
			failed
		};
	}
};

export type { ImportPreviewItem };
