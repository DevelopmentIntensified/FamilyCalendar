package com.familyplanz.app.data

import kotlinx.serialization.Serializable

/**
 * Read model of GET /api/events?from=&to= (issue 082 endpoint; same
 * pipeline as the calendar page). See docs/issues/210 slice 3: the server
 * expands recurring masters into per-day entries (composite occurrence
 * ids `{masterId}~{occISO}`) and splits multi-day events client-side.
 * `window` echoes the range. Attendance blobs stay undeclared (skipped)
 * until the UI needs them.
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
)

@Serializable
data class EventsWindow(val from: String = "", val to: String = "")

@Serializable
data class EventsResponse(val window: EventsWindow = EventsWindow(), val events: List<EventDto> = emptyList())
