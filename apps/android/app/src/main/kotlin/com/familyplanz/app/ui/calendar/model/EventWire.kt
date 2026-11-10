package com.familyplanz.app.ui.calendar.model

import com.familyplanz.app.data.CreateEventRequest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.time.ZoneId

/*
 * The event form's wire shapes (#301): what `POST /api/events` and
 * `PUT /api/events/{id}` receive. Field for field the web's
 * `EventFormModel.svelte.ts` `toEventData()`, plus the occurrence scope
 * `EventFormModal.svelte` adds on an edit.
 */

private const val MIDNIGHT = "00:00"
private const val FALLBACK_TITLE = "Event"

/** `start` / `end` / `allDay` as the web computes them. */
private data class EventSpan(val start: String, val end: String?, val allDay: Boolean)

internal object EventWire {
	fun create(form: CalendarForm, zone: ZoneId): CreateEventRequest? {
		val span = span(form, zone) ?: return null
		val rule = form.repeat.wire
		return CreateEventRequest(
			title = form.cleanTitle().ifBlank { FALLBACK_TITLE },
			start = span.start,
			end = span.end,
			allDay = span.allDay,
			location = form.location.ifBlank { null },
			description = form.description.ifBlank { null },
			calendarId = form.calendarId,
			reminderMinutes = reminder(form),
			recurrenceFrequency = rule,
			recurrenceInterval = rule?.let { form.repeatEvery.coerceAtLeast(1) },
			recurrenceByDay = rule?.let { byDay(form) },
			recurrenceCount = rule?.let { form.recurrenceCount },
			recurrenceUntil = rule?.let { form.recurrenceUntil },
		)
	}

	fun update(form: CalendarForm, zone: ZoneId): JsonObject? {
		val span = span(form, zone) ?: return null
		val rule = form.repeat.wire
		val days = rule?.let { byDay(form) }
		return buildJsonObject {
			put("title", form.cleanTitle().ifBlank { FALLBACK_TITLE })
			if (sendsTimes(form)) {
				put("start", span.start)
				put("end", span.end)
				put("allDay", span.allDay)
			}
			put("description", form.description)
			put("location", form.location)
			form.calendarId?.let { put("calendarId", it) }
			put("reminderMinutes", reminder(form))
			put("recurrenceFrequency", rule)
			put("recurrenceInterval", rule?.let { form.repeatEvery.coerceAtLeast(1) })
			if (days == null) put("recurrenceByDay", JsonNull) else putJsonArray("recurrenceByDay") { days.forEach { add(it) } }
			put("recurrenceCount", rule?.let { form.recurrenceCount })
			put("recurrenceUntil", rule?.let { form.recurrenceUntil })
			if (form.occurrenceEdit) {
				put("scope", form.scope)
				put("occurrenceDate", form.occurrenceDate)
			}
		}
	}

	/**
	 * A whole-series save from one occurrence keeps the series' own start
	 * unless the user changed a date or time: the server moves every
	 * occurrence when it gets a `start`.
	 */
	private fun sendsTimes(form: CalendarForm): Boolean {
		val untouchedSeries = form.occurrenceEdit && form.scope == SCOPE_ALL && form.timesKey() == form.loadedTimes
		return !untouchedSeries
	}

	private fun reminder(form: CalendarForm): Int? = form.reminderMinutes?.takeIf { form.reminderSet && it > 0 }

	/** The weekday list rides along only while the rule it belongs to is unchanged. */
	private fun byDay(form: CalendarForm): List<String>? =
		form.recurrenceByDay?.takeIf { it.isNotEmpty() && form.repeat == form.loadedRepeat }

	@Suppress("ReturnCount")
	private fun span(form: CalendarForm, zone: ZoneId): EventSpan? {
		val day = form.date?.takeIf { it.isNotBlank() } ?: return null
		val wholeDay = wholeDayOf(form)
		val start = CalendarForm.iso(day, if (wholeDay) MIDNIGHT else form.startTime.orEmpty(), zone) ?: return null
		return EventSpan(start, endOf(form, day, wholeDay, zone), wholeDay)
	}

	/** Title + date alone is a complete event: with no start time it saves all-day. */
	private fun wholeDayOf(form: CalendarForm): Boolean = form.allDay || form.startTime.isNullOrBlank()

	@Suppress("ReturnCount")
	private fun endOf(form: CalendarForm, day: String, wholeDay: Boolean, zone: ZoneId): String? {
		val to = form.endTime?.takeIf { it.isNotBlank() }
		val lastDay = form.endDate?.takeIf { form.multiDay && it.isNotBlank() }
		return when {
			lastDay != null -> CalendarForm.iso(lastDay, if (wholeDay || to == null) MIDNIGHT else to, zone)
			// A timed event that names no end runs an hour (the web's `toEventData`).
			wholeDay -> null
			to != null -> CalendarForm.iso(day, to, zone)
			else -> CalendarForm.hourAfter(day, form.startTime.orEmpty(), zone)
		}
	}
}
