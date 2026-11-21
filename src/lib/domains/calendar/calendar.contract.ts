/**
 * calendar contract: the zod schemas and types for every `/api` body and
 * response the goldens pin. Dates on the wire are ISO strings; `POST`/`PUT`
 * answer the raw drizzle row, whose timestamptz columns come back in
 * Postgres's own text render (`2026-10-07 13:00:00+00`), so those response
 * fields are deliberately plain strings.
 *
 * The error copy is the wire: the three golden files pin it. Keep the legacy
 * wording, and keep the legacy leniency — an absent field the writer defaulted
 * must stay absent here rather than becoming a 400.
 *
 * Vocabularies with a rule behind them live in their rules file and are
 * re-exported here; this file only derives their wire types.
 *
 * Doc: ./README.md#invariants
 */
import { isoInstant, oneOf, optionalText, requiredText, z } from '$lib/kernel/validation/validators';
import type { DuplicateReason } from './calendar.import.rules';
import type { EventInvite, InviteType } from './calendar.invites.rules';
import { RECURRENCE_FREQUENCIES, type RecurrenceFrequency } from './calendar.recurrence.rules';
import type { ChipKind } from './calendar.chips.rules';

// --- Closed vocabularies ----------------------------------------------------

/** The four RSVP answers; `undecided` is the stored "no answer yet". */
export const RSVP_STATUSES = ['going', 'maybe', 'declined', 'undecided'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

/** A calendar is the viewer's own or their family's. */
export const CALENDAR_KINDS = ['personal', 'family'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

/** The five bulk operations the endpoint accepts. */
export const BULK_OP_TYPES = ['delete', 'calendar', 'location', 'attendants', 'smart'] as const;
export type BulkOpType = (typeof BULK_OP_TYPES)[number];

/** The weekday codes BYDAY uses (RFC 5545). */
export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export type { DuplicateReason, EventInvite, InviteType, RecurrenceFrequency, ChipKind };

// --- Wire copy --------------------------------------------------------------

/**
 * Every status + `{ error }` body this module answers, in one place. The
 * goldens pin each string; a copy change is a wire change.
 */
export const CALENDAR_COPY = {
	unauthorized: 'Unauthorized',
	invalidEventId: 'Invalid event id',
	eventNotFound: 'Event not found',
	eventNotAccessible: 'Event not accessible',
	noAccessToEvent: 'No access to this event',
	calendarNotAccessible: 'Calendar not accessible',
	occurrenceDateRequired: 'A valid occurrenceDate is required',
	guestNameRequired: 'Guest name is required',
	invalidRsvpStatus: 'Invalid RSVP status',
	failedToCreate: 'Failed to create event',
	failedToUpdate: 'Failed to update event',
	failedToDelete: 'Failed to delete event',
	failedToInviteGuest: 'Failed to invite guest',
	failedToUpdateRsvp: 'Failed to update RSVP',
	failedToFetchAttendance: 'Failed to fetch attendance',
	failedToExport: 'Failed to export event',
	seriesNote: 'Attendee changes apply to the whole series.',
	bulkIdsAndOpRequired: 'ids and op are required',
	bulkNoValidIds: 'No valid event ids',
	bulkNoEditableEvents: 'No editable events matched',
	bulkCalendarIdRequired: 'calendarId required',
	bulkAddNamesRequired: 'add names required',
	bulkInstructionRequired: 'instruction required',
	bulkNoMatch: 'Could not match that instruction. Try naming a date or the events.',
	bulkNoValidChanges: 'No valid changes in plan',
	bulkUnknownOp: 'Unknown op type',
	bulkFailed: 'Bulk edit failed',
	searchQueryInvalid: 'q is required and must be 2-100 characters',
	searchRateLimited: 'Too many searches. Try again shortly.',
	chooseCalendar: 'Choose a calendar to import into.',
	notYourCalendar: 'That calendar is not yours to import into.',
	chooseIcsFile: 'Choose an .ics file to import.',
	tooManyFiles: 'Choose up to 10 files at a time.',
	emptyParse:
		'No events found in that file. An .ics export wraps each event in BEGIN:VEVENT with a ' +
		'SUMMARY and a DTSTART — check you picked the .ics from inside the export, not the whole zip.',
	pickEvents: 'Pick the events you want to add.',
	selectionUnreadable: 'That selection could not be read — preview the file again.',
	tickAtLeastOne: 'Tick at least one event before importing.',
	nothingToUndo: 'Nothing to undo — import a file first.',
	undoUnreadable: 'That undo could not be read — import the file again.'
} as const;

// --- Shared wire shapes -----------------------------------------------------

/** The calendar picker's row (`GET /api/calendars`, `GET /api/import`). */
export const CalendarSummaryWire = z.object({
	id: z.string(),
	name: z.string(),
	color: z.string(),
	kind: oneOf(CALENDAR_KINDS, 'Invalid calendar kind')
});
export type CalendarSummaryWire = z.infer<typeof CalendarSummaryWire>;

/** A raw attendance row (`rsvpStatus` carries THESE, Q-046) — no name join. */
export const CalendarAttendanceRawWire = z.object({
	id: z.string(),
	eventId: z.string(),
	userId: z.string().nullable(),
	name: z.string().nullable(),
	status: z.string().nullable(),
	inviteType: z.string().nullable()
});
export type CalendarAttendanceRawWire = z.infer<typeof CalendarAttendanceRawWire>;

/** An attendance row as the rsvp GET answers it (names from the users join). */
export const CalendarAttendanceWire = z.object({
	id: z.string(),
	eventId: z.string(),
	userId: z.string().nullable(),
	name: z.string().nullable(),
	status: z.string().nullable(),
	inviteType: z.string().nullable(),
	firstName: z.string().nullable(),
	lastName: z.string().nullable()
});
export type CalendarAttendanceWire = z.infer<typeof CalendarAttendanceWire>;

/** The compact per-master "who's going" summary (member rows only). */
export const CalendarAttendanceSummaryWire = z.object({
	going: z.number().int(),
	invited: z.number().int(),
	required: z.number().int(),
	requiredPending: z.number().int(),
	goingNames: z.array(z.string())
});
export type CalendarAttendanceSummaryWire = z.infer<typeof CalendarAttendanceSummaryWire>;

/**
 * One expanded occurrence on the wire. Composite `id`, `masterId` and
 * `occurrenceDate` (the recurrence slot) always travel together; `date` is the
 * viewer-zone day the occurrence was split onto.
 */
export const CalendarDisplayEventWire = z.object({
	id: z.string(),
	calendarId: z.string().nullable(),
	ownerId: z.string(),
	title: z.string(),
	start: isoInstant(),
	end: isoInstant().nullable(),
	description: z.string().nullable(),
	location: z.string().nullable(),
	allDay: z.boolean(),
	recurrenceFrequency: z.string().nullable(),
	recurrenceInterval: z.number().int().nullable(),
	recurrenceByDay: z.array(z.string()).nullable(),
	recurrenceCount: z.number().int().nullable(),
	recurrenceUntil: z.string().nullable(),
	reminderMinutes: z.number().int().nullable(),
	mirrorOf: z.string().nullable(),
	created_at: z.string(),
	masterId: z.string(),
	occurrenceDate: isoInstant(),
	date: isoInstant(),
	rsvpStatus: z.string().optional(),
	attendance: CalendarAttendanceSummaryWire.optional(),
	creatorName: z.string().optional()
});
export type CalendarDisplayEventWire = z.infer<typeof CalendarDisplayEventWire>;

/** `GET /api/events?from&to`. */
export const CalendarEventsResponse = z.object({
	window: z.object({ from: z.string(), to: z.string() }),
	events: z.array(CalendarDisplayEventWire)
});
export type CalendarEventsResponse = z.infer<typeof CalendarEventsResponse>;

/**
 * The raw Event row `POST`/`PUT` answer. `start`/`end`/`recurrenceUntil` are
 * Postgres's text render, never ISO (the goldens pin the exact shape).
 */
export const CalendarEventRowWire = z.object({
	id: z.string(),
	calendarId: z.string().nullable(),
	ownerId: z.string(),
	title: z.string(),
	start: z.string(),
	end: z.string().nullable(),
	description: z.string().nullable(),
	location: z.string().nullable(),
	allDay: z.boolean(),
	recurrenceFrequency: z.string().nullable(),
	recurrenceInterval: z.number().int().nullable(),
	recurrenceByDay: z.array(z.string()).nullable(),
	recurrenceCount: z.number().int().nullable(),
	recurrenceUntil: z.string().nullable(),
	reminderMinutes: z.number().int().nullable(),
	mirrorOf: z.string().nullable(),
	created_at: z.string()
});
export type CalendarEventRowWire = z.infer<typeof CalendarEventRowWire>;

// --- Event create / update --------------------------------------------------

/**
 * A text field on the wire that legacy stored with `value || null`: a present
 * non-string (0, false) became null rather than a 400; an absent key stays
 * absent so the #228 absent-vs-null rule still holds.
 */
const wireText = z
	.preprocess((value) => (typeof value === 'string' ? value : null), z.string().nullable())
	.optional();

/**
 * `POST /api/events`. Absent `end`/`description`/`location` store null and
 * absent `allDay` stores false; an absent `calendarId` uses (or creates) the
 * personal calendar. A missing `title` is NOT a 400 — the legacy writer lets
 * the database reject it and the route answers 500, which the golden pins.
 */
export const CalendarEventCreateBody = z.object({
	title: z.string().optional(),
	start: z.string().optional(),
	end: wireText,
	description: wireText,
	location: wireText,
	allDay: z.boolean().nullish(),
	reminderMinutes: z.number().nullish(),
	calendarId: z.string().nullish(),
	attendees: z.array(z.unknown()).optional(),
	attendants: z.array(z.unknown()).optional(),
	recurrenceFrequency: z.string().nullish(),
	recurrenceInterval: z.number().nullish(),
	recurrenceByDay: z.array(z.string()).nullish(),
	recurrenceCount: z.number().nullish(),
	recurrenceUntil: z.string().nullish()
});
export type CalendarEventCreateBody = z.infer<typeof CalendarEventCreateBody>;

/** `201 {success, event}`. */
export const CalendarEventCreatedResponse = z.object({
	success: z.literal(true),
	event: CalendarEventRowWire
});
export type CalendarEventCreatedResponse = z.infer<typeof CalendarEventCreatedResponse>;

/**
 * `PUT /api/events/[id]`. Every field is optional: an omitted key keeps the
 * stored value and an explicit null/'' clears it (#228). Recurrence is the
 * exception — `normalizeEventRecurrence(body)` runs on every PUT, so an omitted
 * recurrence clears the series (Q-047, pinned).
 */
export const CalendarEventUpdateBody = CalendarEventCreateBody.extend({
	scope: z.unknown().optional(),
	occurrenceDate: z.unknown().optional()
});
export type CalendarEventUpdateBody = z.infer<typeof CalendarEventUpdateBody>;

/** `200 {success, event}` or, for scope `this`, `200 {success, note}`. */
export const CalendarEventUpdatedResponse = z.object({
	success: z.literal(true),
	event: CalendarEventRowWire
});
export type CalendarEventUpdatedResponse = z.infer<typeof CalendarEventUpdatedResponse>;

export const CalendarSeriesNoteResponse = z.object({
	success: z.literal(true),
	note: z.literal(CALENDAR_COPY.seriesNote)
});
export type CalendarSeriesNoteResponse = z.infer<typeof CalendarSeriesNoteResponse>;

/** `DELETE /api/events/[id]` — an absent/unparseable body reads `{}` (whole series). */
export const CalendarEventDeleteBody = z.object({
	scope: z.unknown().optional(),
	occurrenceDate: z.unknown().optional()
});
export type CalendarEventDeleteBody = z.infer<typeof CalendarEventDeleteBody>;

export const CalendarSuccessResponse = z.object({ success: z.literal(true) });
export type CalendarSuccessResponse = z.infer<typeof CalendarSuccessResponse>;

// --- RSVP -------------------------------------------------------------------

/** `GET /api/events/[id]/rsvp`. */
export const CalendarRsvpResponse = z.object({
	attendance: z.array(CalendarAttendanceWire),
	userRsvpStatus: z.string(),
	nonUserAttendants: z.array(z.string())
});
export type CalendarRsvpResponse = z.infer<typeof CalendarRsvpResponse>;

/**
 * `POST /api/events/[id]/rsvp`: a `status` from the vocabulary, or `{guest}`.
 * `guest` wins when present; a non-string or blank guest is 400.
 */
export const CalendarRsvpBody = z.object({
	status: z.string().optional(),
	guest: z.unknown().optional()
});
export type CalendarRsvpBody = z.infer<typeof CalendarRsvpBody>;

/** A status answer: `rsvpStatus` carries the raw attendance ROWS (Q-046, pinned). */
export const CalendarRsvpUpdatedResponse = z.object({
	success: z.literal(true),
	rsvpStatus: z.array(CalendarAttendanceRawWire),
	attendance: z.array(CalendarAttendanceWire)
});
export type CalendarRsvpUpdatedResponse = z.infer<typeof CalendarRsvpUpdatedResponse>;

/** A guest answer: no `rsvpStatus` field at all. */
export const CalendarGuestInvitedResponse = z.object({
	success: z.literal(true),
	attendance: z.array(CalendarAttendanceWire)
});
export type CalendarGuestInvitedResponse = z.infer<typeof CalendarGuestInvitedResponse>;

// --- Bulk -------------------------------------------------------------------

/** One bulk target; a composite id resolves to its master. */
export const CalendarBulkItemWire = z.object({
	id: z.string().optional(),
	occurrenceDate: z.string().nullish()
});
export type CalendarBulkItemWire = z.infer<typeof CalendarBulkItemWire>;

/** One planned change, in both the posted plan and the dryRun answer. */
export const CalendarBulkPlanOpWire = z.object({
	id: z.string(),
	title: z.string().optional(),
	date: z.string().optional(),
	startTime: z.string().optional(),
	endTime: z.string().optional(),
	location: z.string().optional(),
	allDay: z.boolean().optional(),
	calendarId: z.string().optional(),
	delete: z.boolean().optional()
});
export type CalendarBulkPlanOpWire = z.infer<typeof CalendarBulkPlanOpWire>;

/** The five operation shapes, tagged by `type`. */
export const CalendarBulkOpWire = z.object({
	type: oneOf(BULK_OP_TYPES, CALENDAR_COPY.bulkUnknownOp),
	calendarId: z.string().optional(),
	location: z.string().optional(),
	add: z.array(z.unknown()).optional(),
	instruction: z.string().optional()
});
export type CalendarBulkOpWire = z.infer<typeof CalendarBulkOpWire>;

/**
 * `POST /api/events/bulk`. Loose at the top level on purpose: the endpoint
 * owns `ids and op are required`, `No valid event ids`, `Unknown op type` and
 * the per-op copy, so the schema describes the pieces (`CalendarBulkItemWire`,
 * `CalendarBulkOpWire`, `CalendarBulkPlanOpWire`) without replacing them.
 */
export const CalendarBulkBody = z.object({
	ids: z.unknown().optional(),
	op: z.unknown().optional(),
	plan: z.unknown().optional(),
	dryRun: z.boolean().optional()
});
export type CalendarBulkBody = z.infer<typeof CalendarBulkBody>;

export const CalendarBulkAppliedResponse = z.object({
	success: z.literal(true),
	applied: z.number().int(),
	/** Present on the per-item ops; the smart path answers just `applied`. */
	failed: z.array(z.object({ id: z.string(), error: z.string() })).optional()
});
export type CalendarBulkAppliedResponse = z.infer<typeof CalendarBulkAppliedResponse>;

export const CalendarBulkPlanResponse = z.object({
	success: z.literal(true),
	plan: z.array(CalendarBulkPlanOpWire)
});
export type CalendarBulkPlanResponse = z.infer<typeof CalendarBulkPlanResponse>;

// --- Calendars / print / location ------------------------------------------

export const CalendarListResponse = z.object({ calendars: z.array(CalendarSummaryWire) });
export type CalendarListResponse = z.infer<typeof CalendarListResponse>;

export const CalendarPrintCellWire = z.object({
	day: z.number().int(),
	iso: z.string(),
	inMonth: z.boolean(),
	isToday: z.boolean(),
	items: z.array(
		z.object({
			title: z.string(),
			color: z.string(),
			allDay: z.boolean(),
			time: z.string().nullable()
		})
	)
});
export type CalendarPrintCellWire = z.infer<typeof CalendarPrintCellWire>;

export const CalendarPrintResponse = z.object({
	year: z.number().int(),
	month: z.number().int(),
	monthName: z.string(),
	weekStart: oneOf(['sunday', 'monday'] as const, 'Invalid week start'),
	familyName: z.string().nullable(),
	grid: z.array(CalendarPrintCellWire),
	prev: z.object({ year: z.number().int(), month: z.number().int() }),
	next: z.object({ year: z.number().int(), month: z.number().int() }),
	isCurrentMonth: z.boolean()
});
export type CalendarPrintResponse = z.infer<typeof CalendarPrintResponse>;

export const CalendarLocationResponse = z.object({
	results: z.array(z.object({ label: z.string(), lat: z.string(), lon: z.string() }))
});
export type CalendarLocationResponse = z.infer<typeof CalendarLocationResponse>;

// --- Import -----------------------------------------------------------------

/** `GET /api/import` — the import picker's labels. */
export const CalendarImportTargetsResponse = z.object({
	calendars: z.array(z.object({ id: z.string(), name: z.string() }))
});
export type CalendarImportTargetsResponse = z.infer<typeof CalendarImportTargetsResponse>;

/** One posted file: base64 text plus a display name. */
export const CalendarImportFileWire = z.object({
	name: z.string().optional(),
	contentBase64: z.string().optional()
});
export type CalendarImportFileWire = z.infer<typeof CalendarImportFileWire>;

/**
 * `POST /api/import/preview`. Deliberately loose: the flow owns `files must be
 * an array`, `Each file needs contentBase64 (base64 text)` and the choice
 * errors, so a schema here must not replace them with a generic 400.
 */
export const CalendarImportPreviewBody = z.object({
	calendarId: z.unknown().optional(),
	files: z.unknown().optional()
});
export type CalendarImportPreviewBody = z.infer<typeof CalendarImportPreviewBody>;

/**
 * One row the commit accepts: exactly the parser's draft. Preview-only fields
 * are dropped. A batch is all-or-nothing, so one bad row rejects the whole
 * selection rather than half-importing it.
 */
export const CalendarImportDraftWire = z.object({
	title: requiredText(CALENDAR_COPY.tickAtLeastOne).max(200, {
		error: CALENDAR_COPY.tickAtLeastOne
	}),
	startIso: isoInstant(),
	endIso: isoInstant().nullable(),
	allDay: z.boolean(),
	location: optionalText(),
	description: optionalText(),
	recurrenceFrequency: oneOf(
		RECURRENCE_FREQUENCIES,
		CALENDAR_COPY.tickAtLeastOne
	).nullable(),
	recurrenceInterval: z
		.number()
		.min(1)
		.nullable()
		.transform((value) => (value === null ? null : Math.floor(value))),
	recurrenceByDay: z.array(oneOf(WEEKDAY_CODES, CALENDAR_COPY.tickAtLeastOne)).nullable(),
	recurrenceCount: z
		.number()
		.min(1)
		.nullable()
		.transform((value) => (value === null ? null : Math.floor(value))),
	recurrenceUntil: isoInstant().nullable()
});
export type CalendarImportDraftWire = z.infer<typeof CalendarImportDraftWire>;

/**
 * `POST /api/import/commit`: the ticked rows, at most 500. Loose for the same
 * reason as the preview — the flow owns `Pick the events…`, the unreadable
 * selection and the all-or-nothing cap; `CalendarImportDraftWire` validates
 * each row once the flow has read the array.
 */
export const CalendarImportCommitBody = z.object({
	calendarId: z.unknown().optional(),
	picked: z.unknown().optional()
});
export type CalendarImportCommitBody = z.infer<typeof CalendarImportCommitBody>;

/** One preview row on the wire. */
export const CalendarImportPreviewItemWire = CalendarImportDraftWire.extend({
	key: z.string(),
	fileName: z.string(),
	whenText: z.string(),
	duplicate: z.boolean(),
	duplicateReason: z
		.enum(['already-on-calendar', 'earlier-in-file', 'earlier-in-import'], {
			error: 'Invalid duplicate reason'
		})
		.nullable()
});
export type CalendarImportPreviewItemWire = z.infer<typeof CalendarImportPreviewItemWire>;

export const CalendarImportPreviewResponse = z.object({
	preview: z.object({
		calendarId: z.string(),
		calendarName: z.string(),
		fileName: z.string(),
		items: z.array(CalendarImportPreviewItemWire),
		duplicates: z.number().int(),
		files: z.array(
			z.object({
				fileName: z.string(),
				events: z.number().int(),
				duplicates: z.number().int()
			})
		),
		defaultSelection: z.array(z.string())
	})
});
export type CalendarImportPreviewResponse = z.infer<typeof CalendarImportPreviewResponse>;

export const CalendarImportCommitResponse = z.object({
	calendarId: z.string(),
	calendarName: z.string(),
	imported: z.number().int(),
	selected: z.number().int(),
	skipped: z.number().int(),
	skippedDuplicates: z.number().int(),
	failed: z.array(z.string()),
	importedEvents: z.array(
		z.object({ id: z.string(), title: z.string(), startIso: isoInstant() })
	)
});
export type CalendarImportCommitResponse = z.infer<typeof CalendarImportCommitResponse>;

/** One undo batch row: what the success screen carries back. */
export const CalendarImportUndoRefWire = z.object({
	id: requiredText(CALENDAR_COPY.undoUnreadable).max(64, {
		error: CALENDAR_COPY.undoUnreadable
	}),
	title: requiredText(CALENDAR_COPY.undoUnreadable).max(200, {
		error: CALENDAR_COPY.undoUnreadable
	}),
	startIso: isoInstant(CALENDAR_COPY.undoUnreadable)
});
export type CalendarImportUndoRefWire = z.infer<typeof CalendarImportUndoRefWire>;

/** `POST /api/import/undo`: the batch is read by the flow, same errors as commit. */
export const CalendarImportUndoBody = z.object({
	calendarId: z.unknown().optional(),
	batch: z.unknown().optional()
});
export type CalendarImportUndoBody = z.infer<typeof CalendarImportUndoBody>;

export const CalendarImportUndoResponse = z.object({
	calendarName: z.string(),
	removed: z.number().int(),
	kept: z.array(z.object({ id: z.string(), title: z.string() })),
	alreadyGone: z.number().int()
});
export type CalendarImportUndoResponse = z.infer<typeof CalendarImportUndoResponse>;

// --- Server-side row shapes ------------------------------------------------

/**
 * The compact "who's going" summary the repo builds and the display pipeline
 * attaches. Counts member rows only (guests excluded); goingNames are member
 * first names.
 */
export interface EventAttendanceSummary {
	going: number;
	invited: number;
	required: number;
	requiredPending: number;
	goingNames: string[];
}
