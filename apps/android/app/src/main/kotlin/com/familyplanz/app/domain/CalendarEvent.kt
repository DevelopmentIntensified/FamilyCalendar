package com.familyplanz.app.domain

import com.familyplanz.app.data.CalendarTaskDto
import com.familyplanz.app.data.EventDto
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException

/** `EventAttendanceSummary`: invited members only (AttendanceBadge shows `going/invited` when invited > 1). */
data class Attendance(val going: Int, val invited: Int, val requiredPending: Int)

/** Native view of one (per-day) calendar entry from /api/events (or a G6 sponsored row). */
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
	/** YYYY-MM-DD bucket the server computed for this per-day entry (raw; see [localDay]). */
	val day: String,
	val masterId: String? = null,
	val occurrenceDate: String? = null,
	val description: String? = null,
	val calendarId: String = "",
	val ownerId: String = "",
	val reminderMinutes: Int? = null,
	val recurrenceFrequency: String? = null,
	val recurrenceInterval: Int? = null,
	val attendance: Attendance? = null,
	/** Calendar colour (G2) or the sponsored amber; null = chipColor fallback slate-400. */
	val color: String? = null,
	val isAd: Boolean = false,
	/** The bucket as a date in the user's zone. */
	val localDay: LocalDate? = null,
) {
	/** The row a write targets: a recurring occurrence edits its master. */
	val serverId: String get() = masterId ?: id.substringBefore('~')

	val isRecurring: Boolean get() = recurrenceFrequency != null || occurrence
}

/** A due task on the calendar (`dueTasks` in `calendar/+page.server.ts`): open, with a due date. */
data class CalendarTask(
	val id: String,
	val title: String,
	val dueDate: String,
	val dueDay: LocalDate,
	val calendarId: String?,
	val recurrenceFrequency: String? = null,
	val recurrenceInterval: Int? = null,
	val assignedTo: String? = null,
	val assigneeFirstName: String? = null,
	val priority: String = "normal",
	val visibility: String = "public",
	val familyId: String? = null,
	val notes: String? = null,
	val eventTitle: String? = null,
	val completed: Boolean = false,
)

object EventMapper {
	fun fromDto(dto: EventDto, zone: ZoneId = ZoneId.systemDefault()): CalendarEvent {
		val bucket = dto.date ?: dto.start
		return CalendarEvent(
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
			masterId = dto.masterId,
			occurrenceDate = dto.occurrenceDate,
			description = dto.description,
			calendarId = dto.calendarId,
			ownerId = dto.ownerId,
			reminderMinutes = dto.reminderMinutes,
			recurrenceFrequency = dto.recurrenceFrequency,
			recurrenceInterval = dto.recurrenceInterval,
			attendance = dto.attendance?.let { Attendance(it.going, it.invited, it.requiredPending) },
			color = dto.color,
			isAd = dto.isAd,
			localDay = localDateOf(bucket, zone),
		)
	}

	/** Open tasks with a due date only, riding their parent event's calendar (or [personalCalendarId]). */
	fun taskFromDto(dto: CalendarTaskDto, zone: ZoneId, personalCalendarId: String?): CalendarTask? {
		val day = dto.dueDate?.let { localDateOf(it, zone) }
		return day?.let {
			CalendarTask(
				id = dto.id,
				title = dto.title,
				dueDate = dto.dueDate,
				dueDay = it,
				calendarId = dto.eventCalendarId ?: personalCalendarId,
				recurrenceFrequency = dto.recurrenceFrequency,
				recurrenceInterval = dto.recurrenceInterval,
				assignedTo = dto.assignedTo,
				assigneeFirstName = dto.assigneeFirstName,
				priority = dto.priority,
				visibility = dto.visibility,
				familyId = dto.familyId,
				notes = dto.notes,
				eventTitle = dto.eventTitle,
				completed = dto.completedAt != null,
			)
		}
	}
}

/** `YYYY-MM-DD` as is; an ISO instant (`…Z` / offset) read in [zone]; null when unreadable. */
fun localDateOf(value: String, zone: ZoneId): LocalDate? = localDateTimeOf(value, zone)?.toLocalDate()

/** An ISO stamp in [zone]; a bare date is its midnight; a zoneless stamp is taken as local. */
fun localDateTimeOf(value: String, zone: ZoneId): LocalDateTime? {
	val text = value.trim()
	if (text.length == 10) return runCatching { LocalDate.parse(text).atStartOfDay() }.getOrNull()
	return parseOrNull { OffsetDateTime.parse(text).atZoneSameInstant(zone).toLocalDateTime() }
		?: parseOrNull { LocalDateTime.ofInstant(Instant.parse(text), zone) }
		?: parseOrNull { LocalDateTime.parse(text) }
}

private inline fun <T> parseOrNull(block: () -> T): T? =
	try {
		block()
	} catch (_: DateTimeParseException) {
		null
	}
