package com.familyplanz.app.ui.secondary.archive

import com.familyplanz.app.data.ArchiveEventDto
import com.familyplanz.app.ui.secondary.stats.localDateOf
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * `archiveMonths.ts` as pure functions: the month grouping and the retention
 * gate's three bands, tested without a screen.
 */

/** One month card: [key] is `yyyy-MM` (sortable), [label] "November 2026". */
data class ArchiveMonth(val key: String, val label: String, val events: List<ArchiveEventDto>)

private const val UNKNOWN_KEY = "unknown"

/**
 * Newest month first, newest event first inside each month. An event whose
 * start will not parse is grouped under "Date unknown" rather than dropped.
 */
fun groupEventsByMonth(events: List<ArchiveEventDto>, zone: ZoneId = ZoneId.systemDefault()): List<ArchiveMonth> {
	val keyFmt = DateTimeFormatter.ofPattern("yyyy-MM", Locale.ENGLISH)
	val labelFmt = DateTimeFormatter.ofPattern("LLLL yyyy", Locale.ENGLISH)
	val dated = events.map { it to localDateOf(it.start, zone) }
	return dated.groupBy { (_, date) -> date?.format(keyFmt) ?: UNKNOWN_KEY }
		.map { (key, rows) ->
			val first = rows.first().second
			ArchiveMonth(
				key = key,
				label = first?.format(labelFmt) ?: "Date unknown",
				events = rows.sortedByDescending { (event, date) -> instantKey(event.start, date, zone) }.map { it.first },
			)
		}
		.sortedWith(compareBy<ArchiveMonth> { it.key == UNKNOWN_KEY }.thenByDescending { it.key })
}

/** Full instant for ordering inside a month; falls back to the day when the string has no time. */
private fun instantKey(iso: String, date: LocalDate?, zone: ZoneId): Long =
	runCatching { java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
		.getOrElse { date?.atStartOfDay(zone)?.toInstant()?.toEpochMilli() ?: Long.MIN_VALUE }

/** "3 Nov 2026" - the date column of an archive row; "" when unknown. */
fun archiveEventDate(iso: String, zone: ZoneId = ZoneId.systemDefault()): String =
	localDateOf(iso, zone)?.format(DateTimeFormatter.ofPattern("d LLL yyyy", Locale.ENGLISH)).orEmpty()

/** "3 events" / "1 event". */
fun eventCount(n: Int): String = if (n == 1) "$n event" else "$n events"

/** The plan's windows as the three bands of a track (viewable now / kept, not viewable / deleted). */
data class RetentionScale(val total: Int, val viewable: Int, val kept: Int, val deletedAfter: Int, val viewablePct: Int)

/**
 * The far end of the track is the archive window (when the data is gone) and
 * the viewable band is clamped to it, so contradictory config fills the
 * track once; a plan with no windows fills nothing.
 */
fun retentionScale(viewDays: Int, archivedDays: Int): RetentionScale {
	val total = archivedDays.coerceAtLeast(0)
	val viewable = viewDays.coerceAtLeast(0).coerceAtMost(total)
	val pct = if (total == 0) 0 else Math.round(viewable * 100f / total)
	return RetentionScale(total, viewable, (total - viewable).coerceAtLeast(0), total, pct)
}

/** "family" / "families" with the count, as the plan pill reads. */
fun familyPill(count: Int): String = "$count ${if (count == 1) "family" else "families"}"
