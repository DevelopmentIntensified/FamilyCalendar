package com.familyplanz.app.ui.calendar.model

import com.familyplanz.app.domain.CalendarEvent
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

/* Day and week hour grids (DayHourGrid / WeekHourGrid, issue #292 L2): the px-per-hour
 * scale, the scroll target, the range-select gesture constants and the lane layout. */

/** rangeSelect.ts:45 long-press delay and the scroll-cancel slop. */
const val LONG_PRESS_MS = 450L
const val LONG_PRESS_SLOP_PX = 10f

/** DayView.svelte:55 / WeekView: px per hour. */
const val DAY_HOUR_DP = 56
const val WEEK_HOUR_DP = 60

/** WeekView.svelte:333-335: a phone keeps a 700 dp grid and scrolls sideways (AC-CAL-20). */
const val WEEK_MIN_WIDTH_DP = 700

/** 24 hour rows. */
const val HOUR_ROWS = 24

/** DayHourGrid.svelte:48-54: today scrolls to the hour before now, any other day to 07:00. */
fun initialScrollHour(day: LocalDate, now: LocalDateTime): Int =
	if (day == now.toLocalDate()) maxOf(0, now.hour - 1) else 7

/** A timed block in an hour grid: minutes from midnight, and its lane among overlaps. */
data class TimedBlock(val event: CalendarEvent, val startMin: Int, val endMin: Int, val lane: Int, val lanes: Int)

/** Greedy lane layout for one day's timed events (WeekHourGrid / DayHourGrid). */
fun layoutDay(events: List<CalendarEvent>, day: LocalDate, zone: ZoneId): List<TimedBlock> {
	val spans = events.filter { !it.allDay }.mapNotNull { e ->
		val s = startOf(e, zone) ?: return@mapNotNull null
		val startMin = if (s.toLocalDate() < day) 0 else s.toLocalTime().toSecondOfDay() / 60
		val end = endOf(e, zone)
		val endMin = when {
			end == null -> startMin + 60
			end.toLocalDate() > day -> DAY_MINUTES
			else -> end.toLocalTime().toSecondOfDay() / 60
		}
		Triple(e, startMin, maxOf(endMin, startMin + SNAP_MINUTES))
	}.sortedBy { it.second }
	val laneEnds = mutableListOf<Int>()
	val placed = spans.map { (e, s, en) ->
		val lane = laneEnds.indexOfFirst { it <= s }.let { if (it == -1) laneEnds.size.also { laneEnds += en } else it }
		laneEnds[lane] = en
		Triple(e, s to en, lane)
	}
	return placed.map { (e, span, lane) -> TimedBlock(e, span.first, span.second, lane, laneEnds.size) }
}
