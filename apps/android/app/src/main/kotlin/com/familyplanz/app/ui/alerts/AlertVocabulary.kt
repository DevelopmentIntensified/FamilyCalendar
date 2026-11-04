package com.familyplanz.app.ui.alerts

import androidx.compose.ui.graphics.Color
import com.familyplanz.app.data.NotificationDto
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.Slate
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/*
 * The notification vocabulary, ported from src/lib/utils/notificationTypes.ts
 * (LABELS, TONES, GLYPHS, DECISION_TYPES, filter/group/count helpers).
 */

/** Tailwind 3.4.19 `-100` / `-800` steps the TONES table names. */
private object NotifTone {
	val Blue = ChipTone(Color(0xFFDBEAFE), Color(0xFF1E40AF))
	val Emerald = ChipTone(Color(0xFFD1FAE5), Color(0xFF065F46))
	val Red = ChipTone(Color(0xFFFEE2E2), Color(0xFF991B1B))
	val Orange = ChipTone(Color(0xFFFFEDD5), Color(0xFF9A3412))
	val Unknown = ChipTone(Slate.S100, Slate.S600)
}

private data class AlertType(val label: String, val tone: ChipTone, val glyph: String)

private val TYPES = mapOf(
	"assignment_pending" to AlertType("Asked you", NotifTone.Blue, "?"),
	"assignment_accepted" to AlertType("Accepted", NotifTone.Emerald, "✓"),
	"assignment_declined" to AlertType("Declined", NotifTone.Red, "✕"),
	"task_completed" to AlertType("Completed", NotifTone.Emerald, "✓"),
	"added_to_family" to AlertType("Added to family", NotifTone.Orange, "+"),
)

/** The two types that want a decision (DECISION_TYPES). */
private val DECISION_TYPES = setOf("assignment_pending", "assignment_declined")

const val UNKNOWN_TYPE_LABEL = "Update"

fun alertLabel(type: String): String = TYPES[type]?.label ?: UNKNOWN_TYPE_LABEL

fun alertTone(type: String): ChipTone = TYPES[type]?.tone ?: NotifTone.Unknown

fun alertGlyph(type: String): String = TYPES[type]?.glyph ?: "•"

/** The row's type as the column held it (the API sends both; older servers only `type`). */
val NotificationDto.kind: String get() = rawType.ifEmpty { type.orEmpty() }

/** Needs-you or news, from the type alone (an unknown type is news). */
val NotificationDto.needsYou: Boolean get() = kind in DECISION_TYPES

val NotificationDto.unread: Boolean get() = readAt == null

enum class AlertFilter(val label: String) { ALL("All"), NEEDS_YOU("Needs you"), UNREAD("Unread") }

fun List<NotificationDto>.filteredBy(filter: AlertFilter): List<NotificationDto> = when (filter) {
	AlertFilter.ALL -> this
	AlertFilter.NEEDS_YOU -> filter { it.needsYou }
	AlertFilter.UNREAD -> filter { it.unread }
}

/** Chip counts: always over the whole feed, never the active filter. */
fun List<NotificationDto>.countFor(filter: AlertFilter): Int = filteredBy(filter).size

/**
 * Luxon `DateTime.toRelative()` (dateUtils.ts `relativeTime`): the largest of
 * years, quarters, months, weeks, days, hours, minutes, seconds whose count is
 * at least 1, truncated toward zero, "N units ago" / "in N units".
 */
fun relativeTime(iso: String, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String {
	val then = runCatching { Instant.parse(iso) }
		.recoverCatching { java.time.OffsetDateTime.parse(iso).toInstant() }
		.getOrNull() ?: return ""
	val from = ZonedDateTime.ofInstant(now, zone)
	val to = ZonedDateTime.ofInstant(then, zone)
	val months = ChronoUnit.MONTHS.between(from, to)
	val seconds = Duration.between(from, to).seconds
	val units = listOf(
		"year" to ChronoUnit.YEARS.between(from, to),
		"quarter" to months / 3,
		"month" to months,
		"week" to ChronoUnit.WEEKS.between(from, to),
		"day" to ChronoUnit.DAYS.between(from, to),
		"hour" to seconds / 3600,
		"minute" to seconds / 60,
	)
	val (unit, count) = units.firstOrNull { kotlin.math.abs(it.second) >= 1 } ?: ("second" to seconds)
	val n = kotlin.math.abs(count)
	val word = if (n == 1L) unit else "${unit}s"
	return if (count > 0) "in $n $word" else "$n $word ago"
}
