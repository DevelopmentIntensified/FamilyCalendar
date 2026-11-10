package com.familyplanz.app.data

import kotlinx.serialization.Serializable

/**
 * Read model of GET /api/events?from=&to= (issue 082 endpoint; same
 * pipeline as the calendar page). See docs/issues/210 slice 3: the server
 * expands recurring masters into per-day entries (composite occurrence
 * ids `{masterId}~{occISO}`) and splits multi-day events client-side.
 * `window` echoes the range. #292 L2 reads the recurrence rule and the
 * attendance summary too (`src/lib/types.ts` Event). `color` / `isAd` only
 * arrive on G6 sponsored rows; a calendar's colour comes from G2.
 */
@Serializable
data class EventDto(
	val id: String,
	val title: String,
	val start: String,
	val end: String? = null,
	val allDay: Boolean = false,
	val location: String? = null,
	val description: String? = null,
	val calendarId: String = "",
	val ownerId: String = "",
	val mirrorOf: String? = null,
	val reminderMinutes: Int? = null,
	val masterId: String? = null,
	val occurrenceDate: String? = null,
	val date: String? = null,
	val rsvpStatus: String? = null,
	val creatorName: String? = null,
	val createdAt: String? = null,
	val recurrenceFrequency: String? = null,
	val recurrenceInterval: Int? = null,
	/** The rest of the series rule; the form has no control for these and sends them back untouched (#301). */
	val recurrenceByDay: List<String>? = null,
	val recurrenceCount: Int? = null,
	val recurrenceUntil: String? = null,
	val attendance: AttendanceSummaryDto? = null,
	val color: String? = null,
	val isAd: Boolean = false,
)

/** `EventAttendanceSummary` (src/lib/types.ts): invited members only, never guests. */
@Serializable
data class AttendanceSummaryDto(
	val going: Int = 0,
	val invited: Int = 0,
	val required: Int = 0,
	val requiredPending: Int = 0,
	val goingNames: List<String> = emptyList(),
)

@Serializable
data class EventsWindow(val from: String = "", val to: String = "")

@Serializable
data class EventsResponse(val window: EventsWindow = EventsWindow(), val events: List<EventDto> = emptyList())
