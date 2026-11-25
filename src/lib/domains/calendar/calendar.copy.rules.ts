/**
 * calendar copy + closed vocabularies: the constants the wire contract and the
 * browser both read, with no schema library behind them.
 *
 * They live apart from `calendar.contract.ts` so that importing them (through
 * `index.ts`, which every screen's first paint does for the chip and move
 * rules) never evaluates the contract's zod schemas: a module that builds
 * schemas at load cannot be dropped from a bundle, and zod is ~28 KB gzip.
 * `calendar.contract.ts` re-exports everything here, so callers see one place.
 *
 * Doc: ./README.md#invariants
 */

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
	undoUnreadable: 'That undo could not be read — import the file again.',
	/** The JSON→upload adapter's own refusals (legacy `icsImportApi.previewForm`). */
	importFilesNotArray: 'files must be an array',
	importFileNeedsBase64: 'Each file needs contentBase64 (base64 text)'
} as const;
