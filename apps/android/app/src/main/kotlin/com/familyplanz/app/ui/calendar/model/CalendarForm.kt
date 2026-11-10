package com.familyplanz.app.ui.calendar.model

import com.familyplanz.app.data.CalendarTaskCreate
import com.familyplanz.app.data.CreateEventRequest
import com.familyplanz.app.data.ParsedEventDto
import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.localDateTimeOf
import kotlinx.serialization.json.JsonObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeParseException

/*
 * EventFormModal's state (MODALS_SPEC.md): the create/edit form's fields and
 * the rules the primary button obeys. Copy is the web's, verbatim, because
 * AC-CAL-29..31 assert it.
 */

enum class FormKind(val title: String, val subtitle: String) {
	EVENT("Create New Event", "Type naturally, we'll fill in the rest"),
	TASK("Add Task", "A completable item - no event needed"),
}

/** The fields a Quick Add parse filled; each wears a tick (AC-CAL-29). */
enum class FormField { TITLE, DATE, START_TIME, END_TIME, LOCATION, DESCRIPTION }

/** [wire] is the server's `recurrenceFrequency`; null = no rule. */
enum class RepeatOption(val label: String, val wire: String?) {
	NONE("Doesn't repeat", null),
	DAILY("Daily", "daily"),
	WEEKLY("Weekly", "weekly"),
	MONTHLY("Monthly", "monthly"),
	YEARLY("Yearly", "yearly"),
}

/** MODALS_SPEC reminder select order. */
val REMINDER_OPTIONS = listOf(
	null to "No reminder",
	15 to "15 min before",
	30 to "30 min before",
	60 to "1 hour before",
	120 to "2 hours before",
	1440 to "1 day before",
)

/** The server's series scopes (`PUT` / `DELETE /api/events/{id}`): one occurrence, or the whole series. */
const val SCOPE_THIS = "this"
const val SCOPE_ALL = "all"

/** The tag the Task tab reads out of a title (#private / #public). */
private val VISIBILITY_TAG = Regex("#(private|public)\\b", RegexOption.IGNORE_CASE)

/** A 24-hour time as the form's fields write it (the web's `HH:mm`). */
private val HH_MM = Regex("\\d{2}:\\d{2}")

data class CalendarForm(
	val kind: FormKind = FormKind.EVENT,
	val title: String = "",
	val description: String = "",
	val date: String? = null,
	val endDate: String? = null,
	val startTime: String? = null,
	val endTime: String? = null,
	val allDay: Boolean = false,
	val multiDay: Boolean = false,
	val location: String = "",
	val calendarId: String? = null,
	val repeat: RepeatOption = RepeatOption.NONE,
	val repeatEvery: Int = 1,
	val reminderMinutes: Int? = null,
	val reminderSet: Boolean = false,
	val visibility: String = "public",
	val category: String? = null,
	val showMore: Boolean = false,
	val parsed: Set<FormField> = emptySet(),
	/** Set when editing: the event's server id and the series scope of the save. */
	val editId: String? = null,
	val scope: String = SCOPE_ALL,
	/** The occurrence this edit opened on; the server keys a one-occurrence save on it. */
	val occurrenceDate: String? = null,
	/** Series-rule parts the form has no control for; sent back untouched so a save never drops them. */
	val recurrenceByDay: List<String>? = null,
	val recurrenceCount: Int? = null,
	val recurrenceUntil: String? = null,
	/** The rule and the date/time fields as the edit loaded them: tells an untouched value from an edited one. */
	val loadedRepeat: RepeatOption = RepeatOption.NONE,
	val loadedTimes: String? = null,
) {
	val editing: Boolean get() = editId != null

	/** Editing one occurrence of a repeating event (the web's `isRecurringOccurrence`): the save asks for a scope. */
	val occurrenceEdit: Boolean get() = editing && occurrenceDate != null && loadedRepeat != RepeatOption.NONE

	/** A date field holding text that is not a `YYYY-MM-DD` day. */
	val dateInvalid: Boolean get() = !isDay(date) || (multiDay && !isDay(endDate))

	/** A time field holding text that is not an `HH:mm` time (an all-day event has no times). */
	val timeInvalid: Boolean get() = !allDay && (!isTime(startTime) || !isTime(endTime))

	/** The end day falls before the start day (the web's `endDateBeforeStart`). */
	val endDateBeforeStart: Boolean
		get() {
			val first = date.orEmpty()
			val last = endDate.orEmpty()
			val comparable = multiDay && first.isNotBlank() && last.isNotBlank()
			return comparable && !dateInvalid && last < first
		}

	/** The event tab's rule: a title, a real date, times that parse, an end that is not before the start. */
	private val eventValid: Boolean
		get() {
			val filled = title.isNotBlank() && !date.isNullOrBlank()
			val parses = !dateInvalid && !timeInvalid
			val ordered = !endBeforeStart && !endDateBeforeStart
			return filled && parses && ordered
		}

	/** The date/time fields as one comparable value (see [loadedTimes]). */
	fun timesKey(): String = listOf(date, endDate, startTime, endTime, allDay, multiDay).joinToString("|")

	/** "End must be after start" (AC-CAL-30): same-day times that run backwards. */
	val endBeforeStart: Boolean
		get() {
			if (multiDay) return false
			val start = startTime?.takeIf { it.isNotBlank() } ?: return false
			val end = endTime?.takeIf { it.isNotBlank() } ?: return false
			return minutesOf(end) < minutesOf(start)
		}

	val valid: Boolean
		get() = when (kind) {
			FormKind.TASK -> (title.isNotBlank() || visibilityFromTag() != null) && isDay(date)
			FormKind.EVENT -> eventValid
		}

	/** `#private` in the title overrides the visibility select (AC-CAL-31). */
	fun visibilityFromTag(): String? = VISIBILITY_TAG.find(title)?.groupValues?.get(1)?.lowercase()

	fun effectiveVisibility(): String = visibilityFromTag() ?: visibility

	/** The title without its visibility tag, which is a setting, not a name. */
	fun cleanTitle(): String = title.replace(VISIBILITY_TAG, "").replace(Regex("\\s+"), " ").trim()

	val actionLabel: String
		get() = when {
			kind == FormKind.TASK -> "Add Task"
			editing -> "Update"
			else -> "Create"
		}

	val headerTitle: String
		get() = when {
			kind == FormKind.TASK -> FormKind.TASK.title
			editing -> "Edit Event"
			else -> FormKind.EVENT.title
		}

	val headerSubtitle: String
		get() = if (kind == FormKind.TASK) FormKind.TASK.subtitle else FormKind.EVENT.subtitle

	/** POST /api/events body; null only for a form that is not [valid]. */
	fun createRequest(zone: ZoneId): CreateEventRequest? = EventWire.create(this, zone)

	/** PUT /api/events/{id} body; null only for a form that is not [valid]. */
	fun updateBody(zone: ZoneId): JsonObject? = EventWire.update(this, zone)

	fun taskRequest(): CalendarTaskCreate? {
		val name = cleanTitle()
		if (name.isBlank()) return null
		return CalendarTaskCreate(
			title = name,
			dueDate = date,
			visibility = effectiveVisibility(),
			eventId = editId,
		)
	}

	/** Every field the user set by hand is no longer "parsed" (the tick goes away). */
	fun touched(field: FormField): Set<FormField> = parsed - field

	@Suppress("TooManyFunctions")
	companion object {
		/** The FAB: create dated today, no seeded times (web opens empty so the
		 *  quick-add parse never fights a stale "10:00" end; AC-CAL-28). */
		fun create(date: LocalDate, calendarId: String? = null): CalendarForm =
			CalendarForm(date = date.toString(), calendarId = calendarId)

		/** The day sheet / day view: create dated that day; a picked range seeds
		 *  start/end, otherwise the times stay empty (web's openCreateAt). */
		fun createAt(date: LocalDate, range: RangeSelection?, calendarId: String? = null): CalendarForm =
			CalendarForm(
				date = date.toString(),
				calendarId = calendarId,
				startTime = range?.let { hhmm(it.startMin) },
				endTime = range?.let { hhmm(it.endMin) },
			)

		fun task(date: String?, calendarId: String? = null): CalendarForm =
			CalendarForm(kind = FormKind.TASK, date = date, calendarId = calendarId)

		/** A copy is a new event: same fields and rule (the web's `buildDuplicateEventPayload`), no occurrence. */
		fun duplicateOf(event: CalendarEvent, zone: ZoneId, calendarId: String?): CalendarForm =
			fromEvent(event, zone, calendarId).copy(
				title = "${event.title} (copy)",
				editId = null,
				occurrenceDate = null,
				loadedTimes = null,
			)

		fun fromEvent(event: CalendarEvent, zone: ZoneId, calendarId: String?): CalendarForm {
			val start = localDateTimeOf(event.startDate, zone)
			val end = event.endDate?.takeIf { it.isNotBlank() }?.let { localDateTimeOf(it, zone) }
			val rule = repeatOf(event.recurrenceFrequency)
			val occurrence = event.occurrenceDate.takeIf { rule != RepeatOption.NONE }
			val form = CalendarForm(
				title = event.title,
				description = event.description.orEmpty(),
				date = (event.localDay ?: start?.toLocalDate())?.toString(),
				startTime = if (event.allDay) null else start?.toLocalTime()?.let { hhmm(it.hour * 60 + it.minute) },
				endTime = if (event.allDay) null else end?.toLocalTime()?.let { hhmm(it.hour * 60 + it.minute) },
				allDay = event.allDay,
				multiDay = start != null && end != null && end.toLocalDate() != start.toLocalDate(),
				endDate = end?.toLocalDate()?.toString(),
				location = event.location.orEmpty(),
				calendarId = event.calendarId.ifBlank { calendarId },
				repeat = rule,
				repeatEvery = event.recurrenceInterval ?: 1,
				reminderMinutes = event.reminderMinutes,
				reminderSet = event.reminderMinutes != null,
				editId = event.serverId,
				// The web opens an occurrence edit on "this event only" (EventFormModal.svelte `editScope`).
				scope = if (occurrence != null) SCOPE_THIS else SCOPE_ALL,
				occurrenceDate = occurrence,
				recurrenceByDay = event.recurrenceByDay,
				recurrenceCount = event.recurrenceCount,
				recurrenceUntil = event.recurrenceUntil,
				loadedRepeat = rule,
			)
			return form.copy(loadedTimes = form.timesKey())
		}

		/** Quick Add fills what it found and marks those fields (a parse is a hint). */
		@Suppress("CyclomaticComplexMethod")
		fun parsedInto(form: CalendarForm, parsed: ParsedEventDto?): CalendarForm {
			if (parsed == null) return form
			val marks = mutableSetOf<FormField>()
			parsed.title?.trim()?.takeIf { it.isNotEmpty() }?.let {
				marks += FormField.TITLE
			}
			parsed.date?.let { marks += FormField.DATE }
			parsed.startTime?.let { marks += FormField.START_TIME }
			parsed.endTime?.let { marks += FormField.END_TIME }
			parsed.location?.takeIf { it.isNotBlank() }?.let { marks += FormField.LOCATION }
			parsed.description?.takeIf { it.isNotBlank() }?.let { marks += FormField.DESCRIPTION }
			return form.copy(
				title = parsed.title?.trim()?.takeIf { it.isNotEmpty() } ?: form.title,
				date = parsed.date ?: form.date,
				startTime = parsed.startTime ?: form.startTime,
				endTime = parsed.endTime ?: form.endTime,
				location = parsed.location ?: form.location,
				description = parsed.description ?: form.description,
				allDay = parsed.allDay ?: form.allDay,
				parsed = form.parsed + marks,
			)
		}

		fun repeatOf(frequency: String?): RepeatOption = when (frequency?.lowercase()) {
			"daily", "day" -> RepeatOption.DAILY
			"weekly", "week" -> RepeatOption.WEEKLY
			"monthly", "month" -> RepeatOption.MONTHLY
			"yearly", "year", "annually" -> RepeatOption.YEARLY
			else -> RepeatOption.NONE
		}

		/** "every {n} {unit}s" for a repeating rule. */
		fun repeatSummary(option: RepeatOption, every: Int): String {
			if (option == RepeatOption.NONE) return option.label
			val unit = option.label.lowercase().removeSuffix("ly")
			val plural = if (every == 1) unit else "${unit}s"
			return if (every == 1) "Every ${option.label.lowercase()}" else "Every $every $plural"
		}

		/** Blank is "not set" (fine); anything else must be a real `YYYY-MM-DD` day. */
		fun isDay(value: String?): Boolean = value.isNullOrBlank() || runCatching { LocalDate.parse(value) }.isSuccess

		/** Blank is "not set" (fine); anything else must be a real `HH:mm` time. */
		fun isTime(value: String?): Boolean =
			value.isNullOrBlank() || (HH_MM.matches(value) && runCatching { LocalTime.parse(value) }.isSuccess)

		/** One hour after [day] [time]: the web's end for a timed event that names none. */
		fun hourAfter(day: String, time: String, zone: ZoneId): String? =
			try {
				val end = LocalDateTime.of(LocalDate.parse(day), LocalTime.parse(time)).plusHours(1)
				iso(end.toLocalDate().toString(), hhmm(end.hour * 60 + end.minute), zone)
			} catch (_: DateTimeParseException) {
				null
			}

		/** A day's "YYYY-MM-DD" plus "HH:mm" as an offset-stamped ISO instant. */
		fun iso(day: String, time: String, zone: ZoneId): String? =
			try {
				val local = LocalDateTime.of(LocalDate.parse(day), LocalTime.parse(time))
				"${day}T$time:00${zone.rules.getOffset(local)}"
			} catch (_: DateTimeParseException) {
				null
			}

		fun hhmm(minutes: Int): String = "%02d:%02d".format(minutes / 60, minutes % 60)

		fun minutesOf(time: String): Int =
			runCatching { LocalTime.parse(time).let { it.hour * 60 + it.minute } }.getOrDefault(0)

		/** The first month the form's date falls in, for a month picker seed. */
		fun monthOf(date: String?): YearMonth? =
			date?.let { runCatching { YearMonth.from(LocalDate.parse(it)) }.getOrNull() }
	}
}
