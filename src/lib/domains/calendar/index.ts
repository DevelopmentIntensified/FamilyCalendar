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
	BULK_OP_TYPES,
	CALENDAR_COPY,
	CALENDAR_KINDS,
	RSVP_STATUSES,
	WEEKDAY_CODES,
	type BulkOpType,
	type CalendarAttendanceSummaryWire,
	type CalendarAttendanceWire,
	type CalendarDisplayEventWire,
	type CalendarEventsResponse,
	type CalendarEventRowWire,
	type CalendarKind,
	type CalendarSummaryWire,
	type DuplicateReason,
	type EventAttendanceSummary,
	type InviteType,
	type RsvpStatus,
	type WeekdayCode
} from './calendar.contract';
