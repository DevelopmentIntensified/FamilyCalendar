package com.familyplanz.app.domain

import com.familyplanz.app.data.EventDto

/** Native view of one (per-day) calendar entry from /api/events. */
data class CalendarEvent(
	val id: String,
	val title: String,
	val startDate: String,
	val endDate: String?,
	val allDay: Boolean,
	val location: String?,
	val occurrence: Boolean,
	val rsvpStatus: String?,
	val creatorName: String?,
	/** YYYY-MM-DD bucket the server computed for this per-day entry. */
	val day: String,
)

object EventMapper {
	fun fromDto(dto: EventDto): CalendarEvent = CalendarEvent(
		id = dto.id,
		title = dto.title,
		startDate = dto.start,
		endDate = dto.end,
		allDay = dto.allDay,
		location = dto.location,
		occurrence = dto.occurrenceDate != null || dto.masterId != null,
		rsvpStatus = dto.rsvpStatus,
		creatorName = dto.creatorName,
		day = dto.date ?: dto.start.take(10),
	)
}
