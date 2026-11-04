package com.familyplanz.app.ui.calendar.model

import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.localDateTimeOf
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

const val DAY_MINUTES = 24 * 60

/** eventMove.ts `MOVE_SNAP_MINUTES`. */
const val SNAP_MINUTES = 15

private val fmtDayTitle = DateTimeFormatter.ofPattern("EEEE, MMMM d", Locale.ENGLISH)
private val fmtDayFull = DateTimeFormatter.ofPattern("EEEE, MMMM d, yyyy", Locale.ENGLISH)
private val fmtMonth = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH)
private val fmtTime = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)

/** "EEEE, MMMM d" — the day sheet, list heading and Day view title. */
fun dayTitle(date: LocalDate): String = fmtDayTitle.format(date)

/** "EEEE, MMMM d, yyyy" — EventModal's date line. */
fun dayFull(date: LocalDate): String = fmtDayFull.format(date)

fun monthTitle(month: java.time.YearMonth): String = fmtMonth.format(month.atDay(1))

fun timeLabel(time: LocalDateTime): String = fmtTime.format(time)

fun startOf(event: CalendarEvent, zone: ZoneId): LocalDateTime? = localDateTimeOf(event.startDate, zone)

fun endOf(event: CalendarEvent, zone: ZoneId): LocalDateTime? = event.endDate?.takeIf { it.isNotBlank() }?.let { localDateTimeOf(it, zone) }

/** "h:mm a - h:mm a"; an event with no end shows its start only. */
fun timeRange(event: CalendarEvent, zone: ZoneId, separator: String = " - "): String {
	val start = startOf(event, zone) ?: return ""
	val end = endOf(event, zone)
	return if (end == null) timeLabel(start) else timeLabel(start) + separator + timeLabel(end)
}

fun snapMinutes(minutes: Double): Int =
	minOf(DAY_MINUTES - SNAP_MINUTES, maxOf(0, Math.round(minutes / SNAP_MINUTES).toInt() * SNAP_MINUTES))

/** A picked time range on one day (rangeSelect.ts `RangeSelection`). */
data class RangeSelection(val day: LocalDate, val startMin: Int, val endMin: Int) {
	/** `stepEnd`: the end never comes closer than 15 min to the start, nor past midnight. */
	fun stepEnd(delta: Int) = copy(endMin = minOf(DAY_MINUTES, maxOf(startMin + SNAP_MINUTES, endMin + delta)))

	val start: LocalDateTime get() = day.atStartOfDay().plusMinutes(startMin.toLong())
	val end: LocalDateTime get() = day.atStartOfDay().plusMinutes(endMin.toLong())

	companion object {
		/** `normalizeRange`: ordered and snapped; a degenerate drag is a 30-minute block. */
		fun of(day: LocalDate, anchor: Int, current: Int): RangeSelection {
			val start = snapMinutes(minOf(anchor, current).toDouble())
			var end = snapMinutes(maxOf(anchor, current).toDouble())
			if (end - start < SNAP_MINUTES) end = minOf(DAY_MINUTES, start + 30)
			return RangeSelection(day, start, end)
		}

		/** A long-press selects one hour from the pressed minute. */
		fun longPress(day: LocalDate, minute: Int): RangeSelection {
			val start = snapMinutes(minute.toDouble())
			return RangeSelection(day, start, minOf(DAY_MINUTES, start + 60))
		}
	}
}

/** "2:00 PM – 3:30 PM" (eventMove.ts `formatRangeLabel`). */
fun formatRangeLabel(sel: RangeSelection): String =
	timeLabel(sel.start) + " – " + timeLabel(sel.day.atStartOfDay().plusMinutes(sel.endMin.toLong()))
