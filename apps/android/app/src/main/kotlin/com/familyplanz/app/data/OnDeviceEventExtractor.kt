package com.familyplanz.app.data

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime

/**
 * #311's on-device adapter: the day and time shapes a phone can read without
 * Play services (the F-Droid build has no ML Kit). It fills only [ParsedEventDto]
 * fields the server's Quick Add already knows - `date`, `startTime`, `endTime` -
 * and leaves title, place and people to the server, which the chain calls when
 * this finds nothing (see [isEmptyParse]). Regexes live in [Companion] so every
 * shape the phone claims is named in one place; the shapes mirror
 * `domain/tasks/TaskQuickAdd.kt` (day words, `at 19:00`, `7pm`, `~45 minutes`).
 */
class OnDeviceEventExtractor(private val today: () -> LocalDate = { LocalDate.now() }) : EventTextExtractor {
	/** Close-from-open: only a phrase the phone fully recognises is filled; anything else is the empty dto. */
	override suspend fun extract(text: String): ParsedEventDto {
		val start = startTimeOf(text)
		return ParsedEventDto(
			date = dayOf(text)?.toString(),
			startTime = start,
			endTime = start?.let { endOf(it, durationMinutes(text)) },
		)
	}

	/** `tomorrow` beats a weekday word; `friday` from a Tuesday is this week's Friday, today rolls a week. */
	private fun dayOf(text: String): LocalDate? {
		val base = today()
		val relative = RELATIVE_DAY_RE.find(text)?.groupValues?.get(1)
		val weekday = WEEKDAY_BY_NAME[WEEKDAY_RE.find(text)?.groupValues?.get(1).orEmpty().lowercase()]
		return when {
			relative != null -> if (relative.equals("tomorrow", ignoreCase = true)) base.plusDays(1) else base
			weekday != null -> {
				val delta = ((weekday.value - base.dayOfWeek.value + 7) % 7).toLong()
				base.plusDays(if (delta == 0L) 7 else delta)
			}

			else -> null
		}
	}

	/** `7pm` / `7:30 pm` wins over `19:00`; both answer `HH:mm` (the server's Quick Add shape). */
	private fun startTimeOf(text: String): String? {
		val twelve = CLOCK_12_RE.find(text)?.let { match ->
			val hour = match.groupValues[1].toInt()
			val minute = match.groupValues[2].ifBlank { "0" }.toInt()
			val pm = match.groupValues[3].equals("pm", ignoreCase = true)
			if (hour in 1..12 && minute in 0..59) "%02d:%02d".format(hour % 12 + if (pm) 12 else 0, minute) else null
		}
		return twelve ?: CLOCK_24_RE.find(text)?.let { "%02d:%02d".format(it.groupValues[1].toInt(), it.groupValues[2].toInt()) }
	}

	/** `~45 minutes` / `for 2 hours`: minutes, usable only when a start time was found too. */
	private fun durationMinutes(text: String): Int? = DURATION_RE.find(text)?.let { match ->
		val hours = match.groupValues[2].startsWith("h", ignoreCase = true)
		match.groupValues[1].toIntOrNull()?.let { if (hours) it * 60 else it }
	}

	private fun endOf(start: String, minutes: Int?): String? =
		minutes?.takeIf { it > 0 }?.let { LocalTime.parse(start).plusMinutes(it.toLong()).toString().take(5) }

	companion object {
		private val I = setOf(RegexOption.IGNORE_CASE)

		/** `friday` / `fri` / `next fri`, the TaskQuickAdd day words (full name first so it wins). */
		val WEEKDAY_RE = Regex(
			"""\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b""",
			I,
		)

		/** `today` / `tomorrow`: relative to the injectable [today] clock, so tests are deterministic. */
		val RELATIVE_DAY_RE = Regex("""\b(today|tomorrow)\b""", I)

		/** `7pm`, `7:30 pm`, `at 7 pm`; am/pm is required, so a bare `at 7` stays ambiguous and unfilled. */
		val CLOCK_12_RE = Regex("""\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b""", I)

		/** `19:00` / `at 19:00`: 24-hour clock, never mistaken for a `YYYY-MM-DD` date. */
		val CLOCK_24_RE = Regex("""\b([01]?\d|2[0-3]):([0-5]\d)\b""")

		/** `~45 minutes`, `for 2 hours`: only a length, the start time still has to be found. */
		val DURATION_RE = Regex("""(?:~|about\s+|for\s+)?(\d{1,3})\s*(minutes?|mins?|hours?|hrs?)\b""", I)

		private val WEEKDAY_BY_NAME = buildMap<String, DayOfWeek> {
			DayOfWeek.entries.forEach { day ->
				put(day.name.lowercase(), day)
				put(day.name.lowercase().take(3), day)
			}
			put("tues", DayOfWeek.TUESDAY)
			put("thur", DayOfWeek.THURSDAY)
			put("thurs", DayOfWeek.THURSDAY)
		}
	}
}
