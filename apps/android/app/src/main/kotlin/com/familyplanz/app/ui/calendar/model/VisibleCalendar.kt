package com.familyplanz.app.ui.calendar.model

import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask
import com.familyplanz.app.ui.calendar.CalendarUiState

/** Which card replaces the grid (Calendar.svelte:547-665); each appears only for its own claim. */
enum class CalendarEmpty { NONE, FILTERED, SEARCH, ASSIGNEE }

/** What every view draws, after the three reading filters, plus the counts the toolbar and sheet show. */
data class VisibleCalendar(
	val events: List<CalendarEvent>,
	val tasks: List<CalendarTask>,
	/** "N of M": N moves with every filter, M only with the calendar filter. */
	val matches: Int,
	val total: Int,
	val empty: CalendarEmpty,
	val hiddenCalendarNames: List<String>,
	val hiddenAssigneeNames: List<String>,
	val assignees: List<Assignee>,
)

fun visibleOf(state: CalendarUiState): VisibleCalendar {
	val data = state.data
	val calEvents = visibleEventsByCalendar(data.events, state.hiddenCalendars)
	val calTasks = visibleTasksByCalendar(data.tasks, state.hiddenCalendars)
	val searchedEvents = eventsBySearch(calEvents, state.query)
	val searchedTasks = tasksBySearch(calTasks, state.query)
	val events = eventsByAssignee(searchedEvents, state.hiddenAssignees)
	val tasks = tasksByAssignee(searchedTasks, state.hiddenAssignees)
	val members = data.roster.map { it.userId to it.firstName.orEmpty() }
	val assignees = assigneeRows(data.events to data.tasks, events to tasks, data.meId, members)
	val nothingLeft = events.isEmpty() && tasks.isEmpty()
	val allHidden = data.calendars.isNotEmpty() && data.calendars.all { it.id in state.hiddenCalendars }
	val empty = when {
		allHidden && nothingLeft -> CalendarEmpty.FILTERED
		state.query.isNotBlank() && nothingLeft -> CalendarEmpty.SEARCH
		state.hiddenAssignees.isNotEmpty() && nothingLeft -> CalendarEmpty.ASSIGNEE
		else -> CalendarEmpty.NONE
	}
	return VisibleCalendar(
		events = events,
		tasks = tasks,
		matches = events.size + tasks.size,
		total = calEvents.size + calTasks.size,
		empty = empty,
		hiddenCalendarNames = data.calendars.filter { it.id in state.hiddenCalendars }.map { it.name },
		hiddenAssigneeNames = assignees.filter { it.id in state.hiddenAssignees }.map { it.name },
		assignees = assignees,
	)
}
