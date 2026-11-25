/**
 * calendar — public server interface: the services, the `/api` handlers, and
 * the two ports this module implements for its neighbours.
 *
 * Calendar is rank 8, so it may call `identity`, `family` and `alerts`
 * directly through their entries; it owns its four tables and reads `users`
 * for names through the declared join. The two ports it OWNS are exported
 * here and attached in `src/lib/app/ports.server.ts`:
 * - `createCalendarAccessPort(ctx)` — `CalendarAccessPort` for identity's
 *   default-calendar picker (the accessible-calendar scope read).
 * - `createFamilyCalendarPort()` — `FamilyCalendarPort` for family's create
 *   door (the family's `calendars` row, written through the caller's ctx so it
 *   joins family's transaction).
 *
 * Doc: ./README.md#public-interface
 */

// --- Ports this module implements --------------------------------------------

export {
	createCalendarAccessPort,
	createFamilyCalendarPort
} from './calendar.calendars.service.server';

// --- Services -----------------------------------------------------------------

export {
	listAccessibleCalendarIds,
	listCalendars,
	listCalendarChoices,
	getPrintMonth,
	CALENDAR_PERSONAL_NAME,
	CALENDAR_DEFAULT_PERSONAL_COLOR,
	CALENDAR_DEFAULT_FAMILY_COLOR,
	type CalendarSummaryRow,
	type CalendarChoiceRow,
	type CalendarPrintMonth
} from './calendar.calendars.service.server';
export {
	listEventsInWindow,
	listArchivedEvents,
	createEvent,
	updateEvent,
	deleteEvent,
	getEventForViewer,
	type CalendarArchivedEvent,
	type CalendarRangedEvents,
	type CalendarRangedEvent,
	type CalendarEventWriteResult,
	type CalendarEventDetail
} from './calendar.events.service.server';
export {
	countGuestEvents,
	ensurePersonalCalendar,
	moveGuestEvents,
	type MoveGuestEventsInput
} from './calendar.guest.service.server';
export {
	getEventAttendance,
	rsvpEvent,
	inviteEventGuest
} from './calendar.rsvp.service.server';
export { resolveEventInvites, type EventInvitePayload } from './calendar.invites.service.server';
export {
	exportEventIcs,
	listImportTargets,
	previewImport,
	commitImport,
	undoImport,
	MAX_IMPORT_FILE_BYTES,
	MAX_IMPORT_FILES,
	type CalendarImportUpload,
	type CalendarIcsExport,
	type CalendarImportPreviewPayload,
	type CalendarImportCommitPayload,
	type CalendarImportUndoPayload
} from './calendar.ics.service.server';
export {
	bulkEditEvents,
	type CalendarBulkInput,
	type CalendarBulkApplied,
	type CalendarBulkPlanAnswer,
	type CalendarBulkFailure
} from './calendar.bulk.service.server';
export { searchLocations, type CalendarLocationResult } from './calendar.locations.service.server';

// --- HTTP handlers ------------------------------------------------------------

export {
	listEventsEndpoint,
	createEventEndpoint,
	updateEventEndpoint,
	deleteEventEndpoint,
	getEventRsvpEndpoint,
	setEventRsvpEndpoint,
	exportEventIcsEndpoint
} from './calendar.events.http.server';
export {
	listImportTargetsEndpoint,
	previewImportEndpoint,
	commitImportEndpoint,
	undoImportEndpoint
} from './calendar.import.http.server';
export {
	bulkEditEventsEndpoint,
	listCalendarsEndpoint,
	printMonthEndpoint,
	searchLocationsEndpoint
} from './calendar.bulk.http.server';

// --- Page loads ---------------------------------------------------------------

export {
	calendarEventDetailPage,
	calendarImportPage,
	calendarPrintPage,
	type CalendarEventDetailPageData
} from './calendar.pages.http.server';
