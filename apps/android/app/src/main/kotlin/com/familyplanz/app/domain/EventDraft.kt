package com.familyplanz.app.domain

import com.familyplanz.app.data.CreateEventRequest
import com.familyplanz.app.data.ParsedEventDto
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * Editable draft between "parsed" and "created" — a parse is a hint,
 * never a commit (domain rule): the user confirms/edits before POST.
 */
data class EventDraft(
	val title: String,
	val needsTitle: Boolean,
	val date: String?,
	val startTime: String?,
	val endTime: String?,
	val location: String?,
	val allDay: Boolean,
	val attendants: List<String>,
)

object EventDraftMapper {
	fun fromParsed(parsed: ParsedEventDto?): EventDraft? {
		if (parsed == null) return null
		val title = parsed.title?.trim().orEmpty()
		return EventDraft(
			title = title,
			needsTitle = title.isEmpty(),
			date = parsed.date,
			startTime = parsed.startTime,
			endTime = parsed.endTime,
			location = parsed.location,
			allDay = parsed.allDay ?: false,
			attendants = parsed.attendants.orEmpty(),
		)
	}

	/**
	 * `start` composes date + optional time in the device zone and carries an
	 * explicit offset (the server stores timestamptz; no zone guessing).
	 * Missing date blocks creation with `null` — the UI asks for a date.
	 */
	fun toCreateRequest(draft: EventDraft, zone: ZoneId): CreateEventRequest? {
		val date = draft.date
		val usesTime = draft.allDay.not() && !draft.startTime.isNullOrBlank()
		val startIso = if (date != null) {
			composeIso(date, if (usesTime) draft.startTime!! else "00:00", zone)
		} else {
			null
		}
		val endIso = if (usesTime && !draft.endTime.isNullOrBlank()) {
			composeIso(date!!, draft.endTime!!, zone)
		} else {
			null
		}
		if (startIso == null) return null
		return CreateEventRequest(
			title = draft.title.ifBlank { "Event" },
			start = startIso,
			end = endIso,
			allDay = draft.allDay,
			location = draft.location,
		)
	}

	private fun composeIso(date: String, time: String, zone: ZoneId): String? =
		try {
			val local = LocalDateTime.parse("${date}T$time")
			"${date}T${time}:00${zone.rules.getOffset(local)}"
		} catch (_: java.time.DateTimeException) {
			null
		}
}
