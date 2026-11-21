/**
 * calendar — public isomorphic interface: contract types, pure rules, client api.
 * Other modules import calendar ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export {
	buildOccurrenceId,
	normalizeOccurrenceIso,
	resolveMasterId,
	resolveOccurrenceId
} from './calendar.occurrence.rules';
export { buildGoogleCalendarUrl, type GoogleCalendarInput } from './calendar.ics.rules';
export {
	describeRecurrence,
	RECURRENCE_FREQUENCIES,
	type RecurrenceFrequency
} from './calendar.recurrence.rules';
export {
	CHIP_KINDS,
	chipA11y,
	chipKind,
	chipSurfaceStyle,
	chipTreatment,
	chipWord,
	describeEventChip,
	type ChipDensity,
	type ChipKind,
	type ChipShell,
	type ChipTreatment
} from './calendar.chips.rules';
export { createCalendarApi, type CalendarApi } from './calendar.api';
export {
	MOVE_SNAP_MINUTES,
	buildDuplicateEventPayload,
	buildMovePayload,
	eventDurationMinutes,
	formatRangeLabel,
	minutesToDayTime,
	normalizeRange,
	snapMinutes,
	yToMinutes,
	type DuplicateAttendee,
	type DuplicateSource,
	type MoveEvent,
	type MovePayload,
	type MoveTarget
} from './calendar.move.rules';
export {
	calendarAttendancePeople,
	calendarAttendanceSplit,
	calendarAttendanceStatus,
	calendarContactColor,
	calendarDeleteScopes,
	calendarNameForEvent,
	calendarPersonName,
	calendarSeriesFacts,
	type CalendarAttendanceRow,
	type CalendarAttendanceSplit,
	type CalendarAttendanceStatus,
	type CalendarEventView,
	type CalendarGuestRow,
	type CalendarPerson
} from './calendar.eventView.rules';
export {
	BULK_OP_TYPES,
	CALENDAR_COPY,
	CALENDAR_KINDS,
	RSVP_STATUSES,
	WEEKDAY_CODES,
	type BulkOpType,
	type CalendarAttendanceSummaryWire,
	type CalendarBulkPlanOpWire,
	type CalendarAttendanceWire,
	type CalendarDisplayEventWire,
	type CalendarEventsResponse,
	type CalendarEventRowWire,
	type CalendarImportCommitResponse,
	type CalendarImportPreviewResponse,
	type CalendarImportTargetsResponse,
	type CalendarImportUndoResponse,
	type CalendarKind,
	type CalendarSummaryWire,
	type DuplicateReason,
	type EventAttendanceSummary,
	type InviteType,
	type RsvpStatus,
	type WeekdayCode
} from './calendar.contract';
