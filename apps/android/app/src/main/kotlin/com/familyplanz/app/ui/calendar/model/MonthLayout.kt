package com.familyplanz.app.ui.calendar.model

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth

/** MonthDayCell's caps: 3 event chips, 2 task chips (`MAX_CHIPS`, `MAX_TASK_CHIPS`). */
const val MAX_EVENT_CHIPS = 3
const val MAX_TASK_CHIPS = 2

private val SUNDAY_FIRST = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

/** MonthView.svelte:28-34: Sun…Sat, rotated to Mon…Sun when `weekStart == 'monday'`. */
fun weekdayLabels(mondayFirst: Boolean): List<String> =
	if (mondayFirst) SUNDAY_FIRST.drop(1) + SUNDAY_FIRST.first() else SUNDAY_FIRST

data class MonthCell(val date: LocalDate, val otherMonth: Boolean)

/**
 * MonthView.svelte:43-50: the month's days with the previous month's tail
 * before them and the next month's head after them, to whole weeks only
 * (a next month starting on the week start adds no row, #222).
 */
fun monthCells(month: YearMonth, mondayFirst: Boolean): List<MonthCell> {
	val first = month.atDay(1)
	val start = if (mondayFirst) DayOfWeek.MONDAY else DayOfWeek.SUNDAY
	val lead = (first.dayOfWeek.value - start.value + 7) % 7
	val last = month.atEndOfMonth()
	val trail = (7 - (lead + month.lengthOfMonth()) % 7) % 7
	return (lead downTo 1).map { MonthCell(first.minusDays(it.toLong()), true) } +
		(1..month.lengthOfMonth()).map { MonthCell(month.atDay(it), false) } +
		(1..trail).map { MonthCell(last.plusDays(it.toLong()), true) }
}

/** Sat/Sun of the shown month wear the paper wash; an out-of-month day is already muted. */
fun isWeekendWash(cell: MonthCell): Boolean =
	!cell.otherMonth && (cell.date.dayOfWeek == DayOfWeek.SATURDAY || cell.date.dayOfWeek == DayOfWeek.SUNDAY)

/** What one cell draws: shown chips and the "+N more" count (MonthDayCell.svelte `overflow`). */
data class CellPlan(val eventChips: Int, val taskChips: Int, val more: Int)

fun cellPlan(events: Int, tasks: Int): CellPlan {
	val shownEvents = minOf(events, MAX_EVENT_CHIPS)
	val shownTasks = minOf(tasks, MAX_TASK_CHIPS)
	return CellPlan(shownEvents, shownTasks, events - shownEvents + tasks - shownTasks)
}
