package com.familyplanz.app.push

import com.familyplanz.app.data.EventDto
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** One noticed change; [startMillis] orders the summary, [day] is what a tap opens. */
data class EventChange(val line: String, val day: String, val startMillis: Long)

/** The single "Event updates" notification for one refresh. */
data class EventUpdateNotice(val title: String, val text: String, val lines: List<String>, val day: String)

/**
 * Cached-events diff (issue #273 extra): before vs. after an `events_changed`
 * refresh. Only events whose old or new version overlaps now … now+24h count;
 * added, removed (deleted / cancelled occurrence), or start/end/title/location
 * changed. Pure: no Android, no clock.
 */
object EventUpdatePlanner {
	private val WINDOW: Duration = Duration.ofHours(24)
	private const val DATE_LENGTH = 10

	/** Null snapshot = first-ever cache fill: nothing to compare, so nothing to say. */
	fun notice(old: List<EventDto>?, new: List<EventDto>, now: Instant, zone: ZoneId, locale: Locale): EventUpdateNotice? {
		if (old == null) return null
		val changes = changes(old, new, now, zone, locale)
		return changes.firstOrNull()?.let { first ->
			val single = changes.size == 1
			EventUpdateNotice(
				title = if (single) "Event update" else "${changes.size} event updates",
				text = if (single) first.line else "${first.line} and ${changes.size - 1} more",
				lines = changes.map { it.line },
				day = first.day,
			)
		}
	}

	fun changes(old: List<EventDto>, new: List<EventDto>, now: Instant, zone: ZoneId, locale: Locale): List<EventChange> {
		val before = canonical(old)
		val after = canonical(new)
		val window = Window(now, now.plus(WINDOW), zone)
		val text = Wording(now.atZone(zone).toLocalDate(), zone, locale, window)
		return (before.keys + after.keys).mapNotNull { id ->
			val was = before[id]
			val isNow = after[id]
			val shown = isNow ?: was
			val start = shown?.let(window::startOf)
			val touches = listOfNotNull(was, isNow).any(window::overlaps)
			if (shown != null && start != null && touches) change(was, isNow, shown, start, text) else null
		}.sortedBy { it.startMillis }
	}

	/** [shown] is the newest version (the old one for a removal); [start] its start. */
	private fun change(was: EventDto?, isNow: EventDto?, shown: EventDto, start: Instant, text: Wording): EventChange? {
		val line = when {
			was == null -> text.added(shown, start)
			isNow == null -> "Cancelled: ${titleOf(was)}"
			text.window.startOf(was) != start -> text.moved(shown, start)
			else -> text.updated(was, isNow)
		}
		return line?.let { EventChange(it, text.dayOf(start).toString(), start.toEpochMilli()) }
	}

	/** One row per occurrence id (multi-day split rows collapse), mirrors of a listed event dropped. */
	private fun canonical(events: List<EventDto>): Map<String, EventDto> {
		val ids = events.mapTo(HashSet()) { it.id }
		return events.filterNot { it.mirrorOf != null && it.mirrorOf in ids }.distinctBy { it.id }.associateBy { it.id }
	}

	private fun titleOf(event: EventDto): String = event.title.trim().ifEmpty { "Event" }

	private class Window(val from: Instant, val to: Instant, val zone: ZoneId) {
		fun startOf(event: EventDto): Instant? = runCatching {
			if (event.allDay) dateOf(event.start).atStartOfDay(zone).toInstant() else Instant.parse(event.start)
		}.getOrNull()

		private fun endOf(event: EventDto, start: Instant): Instant {
			val end = event.end ?: return if (event.allDay) start.plus(Duration.ofDays(1)) else start
			val parsed = runCatching {
				if (event.allDay) dateOf(end).plusDays(1).atStartOfDay(zone).toInstant() else Instant.parse(end)
			}.getOrNull()
			return parsed?.takeIf { it.isAfter(start) } ?: start
		}

		fun overlaps(event: EventDto): Boolean {
			val start = startOf(event) ?: return false
			return start.isBefore(to) && !endOf(event, start).isBefore(from)
		}

		private fun dateOf(value: String): LocalDate = LocalDate.parse(value.take(DATE_LENGTH))
	}

	private class Wording(val today: LocalDate, val zone: ZoneId, val locale: Locale, val window: Window) {
		private val timeFormat = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale)
		private val weekday = DateTimeFormatter.ofPattern("EEE", locale)

		/** All-day starts are already local midnight, so one rule covers both kinds. */
		fun dayOf(start: Instant): LocalDate = start.atZone(zone).toLocalDate()

		private fun dayWord(start: Instant): String {
			val day = dayOf(start)
			return if (day == today) "today" else day.format(weekday)
		}

		/** JDK CLDR puts a narrow no-break space before AM/PM; plain space reads the same everywhere. */
		private fun timeOf(event: EventDto, start: Instant): String =
			if (event.allDay) "all day" else start.atZone(zone).toLocalTime().format(timeFormat).replace(' ', ' ')

		fun added(event: EventDto, start: Instant): String =
			"New: ${titleOf(event)} · ${timeOf(event, start)} ${dayWord(start)}"

		fun moved(event: EventDto, start: Instant): String =
			"${titleOf(event)} moved to ${timeOf(event, start)} · ${dayWord(start)}"

		fun updated(was: EventDto, isNow: EventDto): String? {
			val fields = listOfNotNull(
				"title".takeIf { was.title != isNow.title },
				"location".takeIf { was.location.orEmpty() != isNow.location.orEmpty() },
				"end time".takeIf { was.end != isNow.end },
			)
			if (fields.isEmpty()) return null
			val joined = if (fields.size == 1) fields[0] else fields.dropLast(1).joinToString(", ") + " and " + fields.last()
			return "Updated: ${titleOf(isNow)} · $joined changed"
		}
	}
}
