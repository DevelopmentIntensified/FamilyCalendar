/**
 * calendar ICS: the single-event `.ics` export and the whole import flow
 * (picker → preview → commit → undo).
 *
 * Ported from `icsImportFlow.ts`, `icsImportApi.ts` and the `/ics` route. The
 * caps are legacy's (5 MB per file, 10 files, 500 rows), dedupe runs again at
 * commit because the calendar can change between preview and save, and undo
 * only removes rows that are still exactly what the import wrote. Each step
 * answers the legacy page's own copy — the goldens pin every string — and
 * every refusal is an `AppError` with the legacy status.
 *
 * Nothing here touches the filesystem or `FormData`: the caller hands over
 * uploads whose text it can read, so the same flow serves the API and the
 * page.
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx } from '$lib/kernel/db/database.server';
import { forbidden, invalid, notFound } from '$lib/kernel/errors/appError';
import { getTimeZone } from '$lib/domains/identity/index.server';
import { listPersonFamilyIds, resolveMembershipFamilyId } from '$lib/domains/family/index.server';
import {
	CalendarImportDraftWire,
	CalendarImportUndoRefWire,
	CALENDAR_COPY
} from './calendar.contract';
import {
	buildFilePreview,
	defaultSelection,
	MAX_IMPORT_EVENTS,
	planCommit,
	planUndo,
	type ImportPreviewItem,
	type ImportedEventRef
} from './calendar.import.rules';
import {
	buildIcsCalendar,
	buildIcsEvent,
	icsFilename,
	parseIcs,
	type IcsEventDraft,
	type IcsEventInput,
	type IcsRecurrence
} from './calendar.ics.rules';
import { resolveOccurrenceId } from './calendar.occurrence.rules';
import {
	deleteImportedRows,
	findAccessibleCalendarIds,
	findCalendar,
	findEvent,
	findException,
	listOwnedCalendars,
	listFamilyCalendars,
	insertCreatorRsvp,
	insertEventRow,
	listExistingDedupeKeys,
	listUndoCandidates
} from './calendar.repo.server';
import { nudgeCalendarEventsChanged } from './calendar.calendars.service.server';

/** One file the caller has already located; `readText` reads its bytes once. */
export type CalendarImportUpload = {
	readonly fileName: string;
	readonly size: number;
	readonly readText: () => Promise<string>;
};

/** Legacy caps: per file, per request, and the parser's row cap. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_FILES = 10;

/** A single-event `.ics` download: the attachment body and its file name. */
export type CalendarIcsExport = { readonly body: string; readonly filename: string };

/** The preview payload the page and `POST /api/import/preview` both answer. */
export type CalendarImportPreviewPayload = {
	readonly calendarId: string;
	readonly calendarName: string;
	readonly fileName: string;
	readonly items: readonly ImportPreviewItem[];
	readonly duplicates: number;
	readonly files: readonly {
		readonly fileName: string;
		readonly events: number;
		readonly duplicates: number;
	}[];
	readonly defaultSelection: readonly string[];
};

/** `POST /api/import/commit`: what landed, and the batch an undo reverses. */
export type CalendarImportCommitPayload = {
	readonly calendarId: string;
	readonly calendarName: string;
	readonly imported: number;
	readonly selected: number;
	readonly skipped: number;
	readonly skippedDuplicates: number;
	readonly failed: readonly string[];
	readonly importedEvents: readonly ImportedEventRef[];
};

/** `POST /api/import/undo`: what was removed, kept and already gone. */
export type CalendarImportUndoPayload = {
	readonly calendarName: string;
	readonly removed: number;
	readonly kept: readonly { readonly id: string; readonly title: string }[];
	readonly alreadyGone: number;
};

/** The label the picker shows for a calendar row (legacy `calendarName`). */
function importCalendarName(calendar: { readonly familyId: string | null }): string {
	return calendar.familyId ? 'Family Calendar' : 'Personal Calendar';
}

/**
 * The shared import preamble: a named calendar that is the viewer's own or
 * their family's. Legacy answers "Choose a calendar" (400) when none was
 * named, then "not yours" (403).
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary: the posted calendarId is untyped JSON.
async function resolveImportTarget(
	ctx: Ctx,
	actor: Actor,
	calendarId: unknown
): Promise<{ readonly calendarId: string; readonly calendarName: string }> {
	if (typeof calendarId !== 'string' || calendarId.length === 0) {
		throw invalid(CALENDAR_COPY.chooseCalendar);
	}
	// Sequential, not Promise.all: the ctx db may be one transaction session.
	const calendar = await findCalendar(ctx.db, calendarId);
	const familyId = await resolveMembershipFamilyId(ctx, actor.id);
	const owned =
		calendar !== null &&
		(calendar.ownerId === actor.id ||
			(calendar.familyId !== null && calendar.familyId === familyId));
	if (!calendar || !owned) throw forbidden(CALENDAR_COPY.notYourCalendar);
	return { calendarId: calendar.id, calendarName: importCalendarName(calendar) };
}

/**
 * A single event as an `.ics` attachment. `id` may be a master id or the
 * composite display id: a scope-'this' Exception Override exports its own
 * fields as one VEVENT, a cancelled occurrence exports nothing, and any
 * viewer who can see the event may read it (legacy read-only semantics).
 */
export async function exportEventIcs(
	ctx: Ctx,
	actor: Actor,
	input: { readonly id: string }
): Promise<CalendarIcsExport> {
	const resolved = resolveOccurrenceId(input.id);
	if (!resolved) throw invalid(CALENDAR_COPY.invalidEventId);

	const event = await findEvent(ctx.db, resolved.masterId);
	if (!event) throw notFound(CALENDAR_COPY.eventNotFound);

	const accessible = await findAccessibleCalendarIds(
		ctx.db,
		actor.id,
		await listPersonFamilyIds(ctx, actor.id)
	);
	const mayRead =
		event.ownerId === actor.id ||
		(event.calendarId !== null && accessible.includes(event.calendarId));
	if (!mayRead) throw forbidden(CALENDAR_COPY.eventNotAccessible);

	const recurrence: IcsRecurrence = {
		recurrenceFrequency: event.recurrenceFrequency,
		recurrenceInterval: event.recurrenceInterval,
		recurrenceByDay: event.recurrenceByDay,
		recurrenceCount: event.recurrenceCount,
		recurrenceUntil: event.recurrenceUntil
	};

	let icsInput: IcsEventInput = {
		id: event.id,
		title: event.title,
		start: event.start,
		end: event.end,
		allDay: event.allDay,
		description: event.description,
		location: event.location,
		recurrence: event.recurrenceFrequency ? recurrence : null
	};

	if (resolved.occurrenceIso && event.recurrenceFrequency) {
		const exception = await findException(ctx.db, event.id, resolved.occurrenceIso);
		if (exception?.isCancelled) throw notFound(CALENDAR_COPY.eventNotFound);
		if (exception) {
			icsInput = {
				id: event.id,
				title: exception.title ?? event.title,
				start: exception.start ?? event.start,
				end: exception.end ?? event.end,
				allDay: exception.allDay ?? event.allDay,
				description: exception.description ?? event.description,
				location: exception.location ?? event.location,
				recurrence: null
			};
		}
	}

	return {
		body: buildIcsCalendar([buildIcsEvent(icsInput, ctx.clock.now())]),
		filename: icsFilename(event.title)
	};
}

/**
 * The calendars a viewer may import into, labelled as the page shows them:
 * their personal calendars first, then the family calendar(s).
 */
export async function listImportTargets(
	ctx: Ctx,
	actor: Actor
): Promise<{ readonly calendars: { readonly id: string; readonly name: string }[] }> {
	const owned = await listOwnedCalendars(ctx.db, actor.id);
	const familyId = await resolveMembershipFamilyId(ctx, actor.id);
	const familyCalendars = familyId ? await listFamilyCalendars(ctx.db, familyId) : [];
	return {
		calendars: [
			...owned.map((calendar) => ({ id: calendar.id, name: 'Personal Calendar' })),
			...familyCalendars.map((calendar) => ({ id: calendar.id, name: 'Family Calendar' }))
		]
	};
}

/**
 * Step one of two: parse and describe, write nothing. The rows it returns are
 * what the commit request later carries, so the preview cannot drift from the
 * save.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary: the posted import body is untyped JSON.
export async function previewImport(
	ctx: Ctx,
	actor: Actor,
	input: { readonly calendarId: unknown; readonly uploads: readonly CalendarImportUpload[] }
): Promise<{ readonly preview: CalendarImportPreviewPayload }> {
	const target = await resolveImportTarget(ctx, actor, input.calendarId);

	const uploads = input.uploads.filter((upload) => upload.size > 0);
	if (uploads.length === 0) throw invalid(CALENDAR_COPY.chooseIcsFile);
	if (uploads.length > MAX_IMPORT_FILES) throw invalid(CALENDAR_COPY.tooManyFiles);

	// Every file is parsed before anything is described: a file that cannot be
	// read has to fail the request rather than quietly vanish from the counts.
	const sources: { readonly fileName: string; readonly drafts: IcsEventDraft[] }[] = [];
	for (const upload of uploads) {
		if (upload.size > MAX_IMPORT_FILE_BYTES) {
			throw invalid(`${upload.fileName} is larger than 5 MB.`);
		}
		let text: string;
		try {
			text = await upload.readText();
		} catch {
			throw invalid(`Could not read ${upload.fileName}.`);
		}
		sources.push({ fileName: upload.fileName, drafts: parseIcs(text) });
	}
	if (sources.every((source) => source.drafts.length === 0)) {
		throw invalid(CALENDAR_COPY.emptyParse);
	}

	const existing = new Set(await listExistingDedupeKeys(ctx.db, target.calendarId));
	const zone = (await getTimeZone(ctx, actor.id)) ?? 'utc';
	const { items, duplicates, files } = buildFilePreview(sources, existing, zone);

	return {
		preview: {
			calendarId: target.calendarId,
			calendarName: target.calendarName,
			// One file keeps its own name in the heading; several are counted,
			// because "kids-activities.ics, work.ics" is not a heading.
			fileName: sources.length === 1 ? sources[0]?.fileName ?? '' : `${sources.length} files`,
			items,
			duplicates,
			files,
			defaultSelection: [...defaultSelection(items)]
		}
	};
}

/**
 * Step two: write only the ticked rows. Dedupe re-runs here on purpose — the
 * calendar can change between preview and commit.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary: the posted import body is untyped JSON.
export async function commitImport(
	ctx: Ctx,
	actor: Actor,
	input: { readonly calendarId: unknown; readonly picked: unknown }
): Promise<CalendarImportCommitPayload> {
	const target = await resolveImportTarget(ctx, actor, input.calendarId);

	const picked = input.picked;
	if (picked === undefined || picked === null) throw invalid(CALENDAR_COPY.pickEvents);
	if (!Array.isArray(picked)) throw invalid(CALENDAR_COPY.selectionUnreadable);
	// All-or-nothing: an empty list, an over-cap list and one malformed row all
	// answer the same page message rather than half-importing.
	const selection = CalendarImportDraftWire.array().safeParse(picked);
	if (picked.length === 0 || picked.length > MAX_IMPORT_EVENTS || !selection.success) {
		throw invalid(CALENDAR_COPY.tickAtLeastOne);
	}
	const selected = selection.data;

	const existing = new Set(await listExistingDedupeKeys(ctx.db, target.calendarId));
	const { toWrite, skippedDuplicates } = planCommit(selected, existing);

	let imported = 0;
	const failed: string[] = [];
	// What landed, by id — the batch an undo reverses (the events table has no
	// import-batch column, so this is the only record of the batch).
	const importedEvents: ImportedEventRef[] = [];
	for (const draft of toWrite) {
		try {
			const created = await withTx(ctx, async (txCtx) => {
				const row = await insertEventRow(txCtx.db, {
					calendarId: target.calendarId,
					ownerId: actor.id,
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
				});
				await insertCreatorRsvp(txCtx.db, row.id, actor.id);
				return row;
			});
			imported++;
			importedEvents.push({ id: created.id, title: draft.title, startIso: draft.startIso });
		} catch (error) {
			ctx.log.error('calendar_import_row_failed', {
				title: draft.title,
				message: error instanceof Error ? error.message : String(error)
			});
			failed.push(draft.title);
		}
	}

	if (imported > 0) void nudgeCalendarEventsChanged(ctx, actor, [target.calendarId]);

	return {
		calendarId: target.calendarId,
		calendarName: target.calendarName,
		imported,
		selected: selected.length,
		skipped: selected.length - imported,
		skippedDuplicates,
		failed,
		importedEvents
	};
}

/**
 * Step three, and the only one that removes rows: put back what this session's
 * commit added. The batch is re-scoped to the viewer and the target calendar,
 * and a row the user has edited since is kept and named rather than deleted.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary: the posted import body is untyped JSON.
export async function undoImport(
	ctx: Ctx,
	actor: Actor,
	input: { readonly calendarId: unknown; readonly batch: unknown }
): Promise<CalendarImportUndoPayload> {
	const target = await resolveImportTarget(ctx, actor, input.calendarId);

	const batch = input.batch;
	if (batch === undefined || batch === null) throw invalid(CALENDAR_COPY.nothingToUndo);
	if (!Array.isArray(batch)) throw invalid(CALENDAR_COPY.undoUnreadable);
	const parsed = CalendarImportUndoRefWire.array().safeParse(batch);
	if (batch.length === 0 || batch.length > MAX_IMPORT_EVENTS || !parsed.success) {
		throw invalid(CALENDAR_COPY.nothingToUndo);
	}

	const live = await listUndoCandidates(
		ctx.db,
		parsed.data.map((row) => row.id),
		actor.id,
		target.calendarId
	);
	const plan = planUndo(parsed.data, live);
	const removed =
		plan.remove.length > 0
			? await deleteImportedRows(ctx.db, plan.remove, actor.id, target.calendarId)
			: 0;
	if (removed > 0) void nudgeCalendarEventsChanged(ctx, actor, [target.calendarId]);

	return {
		calendarName: target.calendarName,
		removed,
		kept: plan.changed,
		alreadyGone: plan.missing.length
	};
}
