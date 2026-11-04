package com.familyplanz.app.ui.secondary.stats

import com.familyplanz.app.data.StatsPersonDto
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.temporal.IsoFields
import java.time.temporal.TemporalAdjusters
import java.util.Locale

/*
 * `statsPageModel.ts` as pure functions: every decision the page makes about
 * a number lives here so it can be tested without a screen.
 */

/** One square of the seven-week streak grid; [label] is W1 (oldest) to W7. */
data class WeekCell(val key: String, val label: String, val hit: Boolean, val isCurrent: Boolean)

/** One row of an assignment bar chart; [pct] is the bar width as a whole percent of the largest row. */
data class AssignmentBar(val name: String, val total: Int, val pct: Int)

private const val WEEKS = 7

/** An ISO instant (offset, zone-less date-time, or a bare date) as a date in [zone]; null if it will not parse. */
internal fun localDateOf(iso: String, zone: ZoneId): LocalDate? {
	if (iso.isBlank()) return null
	return try {
		OffsetDateTime.parse(iso).atZoneSameInstant(zone).toLocalDate()
	} catch (_: DateTimeParseException) {
		try {
			LocalDateTime.parse(iso).toLocalDate()
		} catch (_: DateTimeParseException) {
			try {
				LocalDate.parse(iso)
			} catch (_: DateTimeParseException) {
				null
			}
		}
	}
}

private fun weekKey(monday: LocalDate): String =
	"%04d-W%02d".format(monday.get(IsoFields.WEEK_BASED_YEAR), monday.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR))

private fun mondayOf(date: LocalDate): LocalDate = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))

/**
 * The seven ISO weeks ending with the week [todayIso] falls in, oldest first.
 * Several completions in one week still light one square (the streak counts
 * weeks); an instant that will not parse lights nothing.
 */
fun recentWeekCells(completionIso: List<String>, todayIso: String, zone: ZoneId = ZoneId.systemDefault()): List<WeekCell> {
	val hits = completionIso.mapNotNull { localDateOf(it, zone) }.map { weekKey(mondayOf(it)) }.toSet()
	val end = mondayOf(localDateOf(todayIso, zone) ?: LocalDate.now(zone))
	return List(WEEKS) { i ->
		val key = weekKey(end.minusWeeks((WEEKS - 1 - i).toLong()))
		WeekCell(key, "W${i + 1}", key in hits, isCurrent = i == WEEKS - 1)
	}
}

/** Scales counts into bar widths against the largest one; an all-zero set gives zero-width bars. */
fun assignmentBars(rows: List<StatsPersonDto>): List<AssignmentBar> {
	val max = rows.maxOfOrNull { it.total }?.coerceAtLeast(0) ?: 0
	return rows.map { AssignmentBar(it.name, it.total, if (max == 0) 0 else Math.round(it.total * 100f / max)) }
}

/** "November 2026" - the window the monthly totals are counted over; null when [todayIso] will not parse. */
fun monthCompletionLabel(todayIso: String, zone: ZoneId = ZoneId.systemDefault()): String? =
	localDateOf(todayIso, zone)?.format(DateTimeFormatter.ofPattern("LLLL yyyy", Locale.ENGLISH))

/** "Nov 3" for a completion instant; "" when unknown. */
fun completedLabel(iso: String, zone: ZoneId = ZoneId.systemDefault()): String =
	localDateOf(iso, zone)?.format(DateTimeFormatter.ofPattern("MMM d", Locale.ENGLISH)).orEmpty()
