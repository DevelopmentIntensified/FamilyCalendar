@file:Suppress("TooManyFunctions")
package com.familyplanz.app.ui.calendar.model

import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.domain.localDateTimeOf
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

/* The windows each view draws (issue #292 L2): the padded month grid, one week, one day. */

/** The grid's first and last day, adjacent-month padding included. */
fun monthWindow(month: YearMonth, mondayFirst: Boolean): ClosedRange<LocalDate> {
	val cells = monthCells(month, mondayFirst)
	return cells.first().date..cells.last().date
}

/** WeekView/MonthView: Monday or Sunday first (settings.weekStart). */
fun weekStartOf(date: LocalDate, mondayFirst: Boolean): LocalDate {
	val start = if (mondayFirst) DayOfWeek.MONDAY else DayOfWeek.SUNDAY
	val lead = (date.dayOfWeek.value - start.value + 7) % 7
	return date.minusDays(lead.toLong())
}

fun weekDays(date: LocalDate, mondayFirst: Boolean): List<LocalDate> {
	val first = weekStartOf(date, mondayFirst)
	return (0..6).map { first.plusDays(it.toLong()) }
}

/** The day an event is bucketed to (`localDay`, else the server's `day` prefix). */
fun eventDay(event: CalendarEvent): LocalDate? =
	event.localDay ?: event.day.take(10).let { runCatching { LocalDate.parse(it) }.getOrNull() }

/** All-day rows first, then by start time, then by title - the order every web view draws. */
fun sortedForDay(events: List<CalendarEvent>, zone: ZoneId): List<CalendarEvent> =
	events.sortedWith(
		compareBy<CalendarEvent>({ !it.allDay }, { localDateTimeOf(it.startDate, zone) ?: LocalDate.MIN.atStartOfDay() }, { it.title }),
	)

fun eventsOn(events: List<CalendarEvent>, day: LocalDate, zone: ZoneId): List<CalendarEvent> =
	sortedForDay(events.filter { eventDay(it) == day }, zone)

/** A task chip is dashed and red when overdue; recurring ones carry the ring. */
fun tasksOn(tasks: List<CalendarTask>, day: LocalDate): List<CalendarTask> =
	tasks.filter { it.dueDay == day && !it.completed }.sortedBy { it.title }

fun eventsIn(events: List<CalendarEvent>, window: ClosedRange<LocalDate>): List<CalendarEvent> =
	events.filter { eventDay(it)?.let { day -> day in window } == true }

fun tasksIn(tasks: List<CalendarTask>, window: ClosedRange<LocalDate>): List<CalendarTask> =
	tasks.filter { !it.completed && it.dueDay in window }

/** ListView groups the shown month by day; empty days are not drawn. */
fun monthDaysWithRows(month: YearMonth, events: List<CalendarEvent>, tasks: List<CalendarTask>): List<LocalDate> =
	(events.mapNotNull { eventDay(it) } + tasks.map { it.dueDay })
		.filter { YearMonth.from(it) == month }
		.distinct()
		.sorted()

fun isOverdue(task: CalendarTask, today: LocalDate): Boolean = !task.completed && task.dueDay < today

